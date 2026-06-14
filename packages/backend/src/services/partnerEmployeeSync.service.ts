/**
 * partnerEmployeeSync.service.ts
 *
 * Synchronisiert Mitarbeiterdaten von der FriStD-Bau Partner-API.
 * Endpunkt: GET /api/partner/employees  (X-API-Key Header)
 * Antwortformat: { total: number, employees: PartnerEmployee[] }
 *
 * Mapping:
 *   partner.id        → externeId (UUID-String, unique)
 *   partner.firstName → vorname
 *   partner.lastName  → nachname
 *   partner.trade     → Rolle-Bezeichnung (wird bei Bedarf angelegt)
 *   partner.isActive  → aktiv
 *   partner.entryDate → eintrittsdatum (YYYY-MM-DD oder null)
 *   partner.exitDate  → austrittsdatum (YYYY-MM-DD oder null)
 *
 * Sichtbarkeitsregel:
 *   - exitDate gesetzt + mehr als 4 Wochen vergangen → aktiv = false
 *   - exitDate gesetzt + noch innerhalb 4-Wochen-Frist  → aktiv = true (Übergangszeit)
 *   - exitDate null → aktiv aus partner.isActive übernehmen
 *
 * Regeln:
 *   - Neue Mitarbeiter werden angelegt
 *   - Bestehende (per externeId) werden aktualisiert
 *   - kranktageAktuellesJahr + auszahlungspraeferenz werden NICHT überschrieben
 *   - Manuell angelegte Mitarbeiter (externeId = null) bleiben unberührt
 */

import axios from 'axios';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client';

interface PartnerEmployee {
  id:                string;
  employeeNumber:    string;
  firstName:         string;
  lastName:          string;
  username?:         string | null;
  email?:            string | null;
  phone?:            string | null;
  alternativePhone?: string | null;
  role?:             string | null;
  trade?:            string | null;
  isActive:          boolean;
  entryDate?:        string | null;
  exitDate?:         string | null;
}

interface PartnerResponse {
  total:     number;
  employees: PartnerEmployee[];
}

export interface PartnerSyncErgebnis {
  gesamt:      number;
  angelegt:    number;
  aktualisiert: number;
  fehler:      string[];
}

function isPartnerResponse(obj: unknown): obj is PartnerResponse {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return typeof o.total === 'number' && Array.isArray(o.employees);
}

function isPartnerEmployee(obj: unknown): obj is PartnerEmployee {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id        === 'string' &&
    typeof o.firstName === 'string' &&
    typeof o.lastName  === 'string' &&
    typeof o.isActive  === 'boolean'
  );
}

export async function syncPartnerEmployees(): Promise<PartnerSyncErgebnis> {
  const apiKey = process.env.PARTNER_API_KEY;
  if (!apiKey) throw new Error('PARTNER_API_KEY ist nicht konfiguriert');

  const response = await axios.get(
    'https://fristd-bau.replit.app/api/partner/employees',
    {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      timeout: 30_000,
    },
  );

  const body = response.data;

  if (!isPartnerResponse(body)) {
    throw new Error(`Unerwartetes API-Format: ${JSON.stringify(body).slice(0, 100)}`);
  }

  let angelegt    = 0;
  let aktualisiert = 0;
  const fehler: string[] = [];

  // Nur Mitarbeiter aus dem 70000er-Nummernkreis importieren
  const relevanteEmployees = body.employees.filter(
    (e) => typeof e.employeeNumber === 'string' && e.employeeNumber.startsWith('7'),
  );

  for (const item of relevanteEmployees) {
    if (!isPartnerEmployee(item)) {
      fehler.push(`Ungültiger Datensatz: ${JSON.stringify(item).slice(0, 80)}`);
      continue;
    }

    try {
      const rolleBezeichnung = item.trade?.trim() || 'Mitarbeiter';

      const vorher = await prisma.mitarbeiter.findUnique({ where: { externeId: item.id } });

      const eintrittsdatum = item.entryDate ? new Date(item.entryDate) : null;
      const austrittsdatum = item.exitDate  ? new Date(item.exitDate)  : null;

      // Sichtbarkeit: nach Austrittsdatum noch 4 Wochen sichtbar, danach inaktiv
      let aktiv: boolean;
      if (austrittsdatum) {
        const vierWochenNachAustritt = new Date(austrittsdatum);
        vierWochenNachAustritt.setDate(vierWochenNachAustritt.getDate() + 28);
        aktiv = new Date() <= vierWochenNachAustritt;
      } else {
        aktiv = item.isActive;
      }

      if (vorher) {
        // rolleId wird bei bestehenden Mitarbeitern NICHT überschrieben —
        // die Rollenzuordnung wird im BonusTrack-Adminbereich manuell gepflegt.
        // Rollen werden für bestehende Mitarbeiter auch NICHT neu angelegt —
        // das verhindert, dass gelöschte Rollen beim nächsten Sync wiederkehren.
        await prisma.mitarbeiter.update({
          where: { externeId: item.id },
          data: {
            personalNummer:        item.employeeNumber ?? undefined,
            vorname:               item.firstName.trim(),
            nachname:              item.lastName.trim(),
            ...(item.email ? { email: item.email.toLowerCase().trim() } : {}),
            aktiv,
            eintrittsdatum,
            austrittsdatum,
            zuletztSynchronisiert: new Date(),
          },
        });
        aktualisiert++;
      } else {
        // Neue Mitarbeiter: Rolle aus Partner-API als Initialwert setzen.
        // Die Rollen-Upsert läuft nur hier, damit gelöschte Rollen nicht
        // bei jedem Sync für bereits vorhandene Mitarbeiter neu angelegt werden.
        const rolle = await prisma.rolle.upsert({
          where:  { bezeichnung: rolleBezeichnung },
          create: { bezeichnung: rolleBezeichnung, faktor: new Prisma.Decimal(1.0) },
          update: {},
        });

        await prisma.mitarbeiter.create({
          data: {
            externeId:             item.id,
            personalNummer:        item.employeeNumber ?? undefined,
            vorname:               item.firstName.trim(),
            nachname:              item.lastName.trim(),
            email:                 item.email ? item.email.toLowerCase().trim() : undefined,
            rolleId:               rolle.id,
            aktiv,
            eintrittsdatum,
            austrittsdatum,
            zuletztSynchronisiert: new Date(),
          },
        });
        angelegt++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fehler.push(`${item.firstName} ${item.lastName} (${item.id.slice(0, 8)}): ${msg}`);
    }
  }

  return { gesamt: relevanteEmployees.length, angelegt, aktualisiert, fehler };
}
