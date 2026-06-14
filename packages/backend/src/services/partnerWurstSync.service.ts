/**
 * partnerWurstSync.service.ts
 *
 * Synchronisiert offene "Wurststunden" von der FriStD-Bau Partner-API.
 * Endpunkt: GET /api/partner/wurst?startDate=...&endDate=...&resolved=false
 *
 * Was gespeichert wird:
 *   - Je Mitarbeiter: Summe der OFFENEN (resolved=false) Wurststunden für das Jahr
 *   - Gespeichert in wurst_abzug (upsert, wird bei jedem Sync überschrieben)
 *   - Mitarbeiter ohne offene Stunden: offeneStunden = 0
 *
 * Verwendung in der Bonus-Berechnung:
 *   - offeneStunden werden von den Option-A-Stunden abgezogen
 *   - Erst wenn alle Positionen aufgelöst sind (resolved=true), entfällt der Abzug
 */

import axios from 'axios';
import { prisma } from '../db/client';

const BASE_URL = 'https://fristd-bau.replit.app';

// ─── Typen ───────────────────────────────────────────────────────────────────

interface WurstByEmployee {
  workerName:      string;
  employeeNumber:  string;
  totalHours:      number;
  entryCount:      number;
  unresolvedCount: number;
}

interface WurstResponse {
  total?:          number;
  totalHours?:     number;
  unresolvedCount?: number;
  byEmployee?:     WurstByEmployee[];
  entries?:        unknown[];
}

export interface WurstSyncErgebnis {
  aktualisiert: number;
  offeneStunden: number;
  fehler:        string[];
  hinweis?:      string;
}

// ─── Sync-Funktion ────────────────────────────────────────────────────────────

export async function syncPartnerWurst(kalenderjahr: number): Promise<WurstSyncErgebnis> {
  const apiKey = process.env.PARTNER_API_KEY;
  if (!apiKey) {
    return { aktualisiert: 0, offeneStunden: 0, fehler: [], hinweis: 'PARTNER_API_KEY nicht gesetzt — Wurst-Sync übersprungen' };
  }

  const startDate = `${kalenderjahr}-01-01`;
  const endDate   = `${kalenderjahr}-12-31`;

  let daten: WurstResponse;
  try {
    const res = await axios.get<WurstResponse>(`${BASE_URL}/api/partner/wurst`, {
      headers: { 'X-API-Key': apiKey },
      params:  { startDate, endDate, resolved: 'false' },
      timeout: 15_000,
    });
    daten = res.data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('404') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
      return { aktualisiert: 0, offeneStunden: 0, fehler: [], hinweis: `Wurst-Endpunkt nicht verfügbar (${msg}) — übersprungen` };
    }
    return { aktualisiert: 0, offeneStunden: 0, fehler: [`API-Fehler: ${msg}`] };
  }

  const byEmployee = daten.byEmployee ?? [];
  const fehler: string[] = [];
  let aktualisiert = 0;
  let gesamtOffeneStunden = 0;

  // Alle Mitarbeiter laden (für Zuordnung per personalNummer)
  const alleMitarbeiter = await prisma.mitarbeiter.findMany({
    where: { aktiv: true },
    select: { id: true, personalNummer: true },
  });
  const maByNummer = new Map(alleMitarbeiter.map((m) => [m.personalNummer, m.id]));

  // Zuerst alle aktiven MA auf 0 Stunden zurücksetzen (für MA ohne offene Einträge)
  // Damit verschwindet der Abzug automatisch wenn alle Positionen aufgelöst wurden
  await prisma.wurstAbzug.updateMany({
    where: { kalenderjahr },
    data:  { offeneStunden: 0, offeneEintraege: 0, zuletztSynchronisiert: new Date() },
  });

  // Dann je Mitarbeiter die aktuellen offenen Stunden eintragen
  for (const eintrag of byEmployee) {
    const maId = maByNummer.get(eintrag.employeeNumber);
    if (!maId) {
      fehler.push(`Kein Mitarbeiter für Personalnummer ${eintrag.employeeNumber} (${eintrag.workerName})`);
      continue;
    }

    const offeneStunden = eintrag.totalHours ?? 0;
    gesamtOffeneStunden += offeneStunden;

    try {
      await prisma.wurstAbzug.upsert({
        where:  { mitarbeiterId_kalenderjahr: { mitarbeiterId: maId, kalenderjahr } },
        update: {
          offeneStunden:         offeneStunden,
          offeneEintraege:       eintrag.unresolvedCount ?? eintrag.entryCount ?? 0,
          zuletztSynchronisiert: new Date(),
        },
        create: {
          mitarbeiterId:         maId,
          kalenderjahr,
          offeneStunden:         offeneStunden,
          offeneEintraege:       eintrag.unresolvedCount ?? eintrag.entryCount ?? 0,
        },
      });
      aktualisiert++;
    } catch (err) {
      fehler.push(`Upsert fehlgeschlagen für MA ${maId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { aktualisiert, offeneStunden: gesamtOffeneStunden, fehler };
}
