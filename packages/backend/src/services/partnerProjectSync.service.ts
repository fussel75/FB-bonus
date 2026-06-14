/**
 * partnerProjectSync.service.ts
 *
 * Synchronisiert Projektdaten und Ist-Stunden von der FriStD-Bau Partner-API.
 *
 * Endpunkte:
 *   GET /api/partner/projects              → Projektliste (Soll/Ist-Stunden)
 *   GET /api/partner/projects/:id/timeentries → Zeitbuchungen je Projekt
 *
 * Mapping:
 *   partner.projectNumber → projektnummer (unique key)
 *   partner.name          → projektname
 *   partner.totalHours    → sollStunden
 *   partner.usedHours     → istStundenGesamt
 *   partner.status        → status (active→aktiv, completed→abgeschlossen, paused→pausiert)
 *
 *   Timeentries (wageType "001" only):
 *     employeeNumber → Mitarbeiter.personalNummer (link)
 *     hours          → ProjektMitarbeiter.istStunden (aggregiert)
 *
 * Regeln:
 *   - Nur Zeitbuchungen mit wageType "001" (reguläre Arbeit) werden für Ist-Stunden gezählt
 *   - Mitarbeiter ohne personalNummer-Treffer werden als Warnung geloggt (nicht abgebrochen)
 *   - ProjektMitarbeiter: vor Neubeschreibung werden alte Einträge gelöscht (sauber)
 *   - manuell erstellte Projekte (ohne Partner-Sync) bleiben unberührt
 */

import axios from 'axios';
import { Prisma, ProjektStatus } from '@prisma/client';
import { prisma } from '../db/client';

const BASE_URL = 'https://fristd-bau.replit.app';
const WORK_WAGE_TYPE = '001';

// ─── Typen ───────────────────────────────────────────────────────────────────

interface PartnerProject {
  projectNumber: string;
  name:          string;
  status:        string;
  usedHours:     number;
  totalHours:    number;
  description?:  string | null;
}

interface PartnerTimeEntry {
  id:             string;
  projectNumber:  string;
  date:           string;
  hours:          number;
  wageType:       string;
  employeeNumber: string;
  workerName:     string;
  isExtraHours:   boolean;
}

interface PartnerTimeEntriesResponse {
  entries?: PartnerTimeEntry[];
  timeEntries?: PartnerTimeEntry[];
  data?: PartnerTimeEntry[];
}

export interface PartnerProjectSyncErgebnis {
  projekte:          number;
  angelegt:          number;
  aktualisiert:      number;
  stundenAktualisiert: number;
  fehler:            string[];
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function mapStatus(partnerStatus: string): ProjektStatus {
  switch (partnerStatus.toLowerCase()) {
    case 'active':    return ProjektStatus.aktiv;
    case 'completed': return ProjektStatus.abgeschlossen;
    case 'paused':    return ProjektStatus.pausiert;
    default:          return ProjektStatus.aktiv;
  }
}

function isPartnerProject(obj: unknown): obj is PartnerProject {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.projectNumber === 'string' &&
    typeof o.name          === 'string' &&
    typeof o.status        === 'string' &&
    typeof o.usedHours     === 'number' &&
    typeof o.totalHours    === 'number'
  );
}

function extractTimeEntries(raw: unknown): PartnerTimeEntry[] {
  if (Array.isArray(raw)) return raw as PartnerTimeEntry[];
  const r = raw as PartnerTimeEntriesResponse;
  return (r?.entries ?? r?.timeEntries ?? r?.data ?? []) as PartnerTimeEntry[];
}

// ─── Haupt-Sync ──────────────────────────────────────────────────────────────

export async function syncPartnerProjects(): Promise<PartnerProjectSyncErgebnis> {
  const apiKey = process.env.PARTNER_API_KEY;
  if (!apiKey) throw new Error('PARTNER_API_KEY ist nicht konfiguriert');

  const headers = { 'X-API-Key': apiKey, Accept: 'application/json' };

  // ── 1. Projektliste laden ─────────────────────────────────────────────────
  const projectsResponse = await axios.get(`${BASE_URL}/api/partner/projects`, {
    headers,
    timeout: 30_000,
  });

  const rawProjects: unknown = projectsResponse.data;
  const projectList: unknown[] = Array.isArray(rawProjects)
    ? rawProjects
    : ((rawProjects as Record<string, unknown>)?.projects ?? []) as unknown[];

  let angelegt          = 0;
  let aktualisiert      = 0;
  let stundenAktualisiert = 0;
  const fehler: string[] = [];

  // ── 2. Je Projekt synchronisieren ────────────────────────────────────────
  for (const item of projectList) {
    if (!isPartnerProject(item)) {
      fehler.push(`Ungültiger Projektdatensatz: ${JSON.stringify(item).slice(0, 80)}`);
      continue;
    }

    try {
      const status = mapStatus(item.status);

      // Projekt upserten (via projektnummer als unique key)
      const vorher = await prisma.projekt.findUnique({
        where: { projektnummer: item.projectNumber },
      });

      const projekt = await prisma.projekt.upsert({
        where:  { projektnummer: item.projectNumber },
        create: {
          projektnummer:         item.projectNumber,
          projektname:           item.name.trim(),
          sollStunden:           new Prisma.Decimal(item.totalHours),
          istStundenGesamt:      new Prisma.Decimal(item.usedHours),
          status,
          zuletztSynchronisiert: new Date(),
        },
        update: {
          projektname:           item.name.trim(),
          sollStunden:           new Prisma.Decimal(item.totalHours),
          istStundenGesamt:      new Prisma.Decimal(item.usedHours),
          status,
          zuletztSynchronisiert: new Date(),
        },
      });

      vorher ? aktualisiert++ : angelegt++;

      // ── 3. Zeitbuchungen laden und Ist-Stunden je MA aggregieren ─────────
      try {
        const teResponse = await axios.get(
          `${BASE_URL}/api/partner/projects/${item.projectNumber}/timeentries`,
          { headers, timeout: 30_000 },
        );

        const entries = extractTimeEntries(teResponse.data)
          .filter((e) => e.wageType === WORK_WAGE_TYPE);

        // Aggregation: employeeNumber → Map<jahr, Stunden>
        const stundenJeMAJahr = new Map<string, Map<number, number>>();
        for (const entry of entries) {
          if (typeof entry.employeeNumber !== 'string' || typeof entry.hours !== 'number') continue;
          const parsedYear = entry.date ? new Date(entry.date).getFullYear() : NaN;
          const jahr = parsedYear >= 2000 && parsedYear <= 2100
            ? parsedYear
            : new Date().getFullYear();
          if (!stundenJeMAJahr.has(entry.employeeNumber)) {
            stundenJeMAJahr.set(entry.employeeNumber, new Map());
          }
          const jahresMap = stundenJeMAJahr.get(entry.employeeNumber)!;
          jahresMap.set(jahr, (jahresMap.get(jahr) ?? 0) + entry.hours);
        }

        // Bestehende extraStunden vor dem Löschen sichern
        // (extraStunden werden vom Extras-Sync gepflegt und dürfen beim Projekt-Sync
        //  nicht verloren gehen — insbesondere wenn der Extras-Sync danach fehlschlägt)
        const vorhandeneExtras = await prisma.projektMitarbeiter.findMany({
          where:  { projektId: projekt.id },
          select: { mitarbeiterId: true, jahr: true, extraStunden: true },
        });
        const extrasMap = new Map(
          vorhandeneExtras.map((e) => [`${e.mitarbeiterId}::${e.jahr}`, Number(e.extraStunden)]),
        );

        // Alle alten Einträge für dieses Projekt löschen
        await prisma.projektMitarbeiter.deleteMany({ where: { projektId: projekt.id } });

        // Neue Einträge schreiben — je Mitarbeiter je Kalenderjahr eine Zeile
        // extraStunden aus der gesicherten Map wiederherstellen
        for (const [personalNummer, jahresMap] of stundenJeMAJahr.entries()) {
          const ma = await prisma.mitarbeiter.findUnique({
            where: { personalNummer },
          });

          if (!ma) {
            fehler.push(`Projekt ${item.projectNumber}: Mitarbeiter ${personalNummer} nicht gefunden`);
            continue;
          }

          for (const [jahr, stunden] of jahresMap.entries()) {
            const extras = extrasMap.get(`${ma.id}::${jahr}`) ?? 0;
            await prisma.projektMitarbeiter.create({
              data: {
                projektId:     projekt.id,
                mitarbeiterId: ma.id,
                jahr,
                istStunden:    new Prisma.Decimal(stunden),
                extraStunden:  new Prisma.Decimal(extras),
              },
            });
          }
        }

        stundenAktualisiert++;
      } catch (teErr) {
        const msg = teErr instanceof Error ? teErr.message : String(teErr);
        fehler.push(`Projekt ${item.projectNumber} – Timeentries Fehler: ${msg}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fehler.push(`Projekt ${item.projectNumber}: ${msg}`);
    }
  }

  return {
    projekte: projectList.length,
    angelegt,
    aktualisiert,
    stundenAktualisiert,
    fehler,
  };
}
