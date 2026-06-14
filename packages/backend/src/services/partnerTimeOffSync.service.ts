/**
 * partnerTimeOffSync.service.ts
 *
 * Synchronisiert Kranktage aus der FriStD-Bau Partner-API.
 * Endpunkt: GET /api/partner/time-off?type=sick&startDate=...&endDate=...
 *
 * Logik:
 *   - Alle Krankmeldungen für das gewünschte Kalenderjahr serverseitig laden
 *   - Kranktage je Mitarbeiter zählen (employeeNumber → personalNummer)
 *   - kranktageAktuellesJahr im Mitarbeiter-Datensatz überschreiben
 *
 * Hinweis:
 *   - Wenn der Endpunkt nicht verfügbar ist (HTML-Antwort, Timeout, 4xx/5xx),
 *     wird die Sync übersprungen und eine Warnung geloggt — kein harter Fehler.
 *   - Manuell angelegte Mitarbeiter (personalNummer = null) werden nicht berührt.
 */

import axios from 'axios';
import { prisma } from '../db/client';

const BASE_URL = 'https://fristd-bau.replit.app';

// ─── Typen ───────────────────────────────────────────────────────────────────

interface TimeOffEntry {
  id:             string;
  employeeNumber: string;
  workerName?:    string;
  category:       string;
  wageType?:      string;
  wageTypeLabel?: string;
  date:           string;
  days?:          number;
  hours?:         number;
  approved?:      boolean;
  notes?:         string | null;
}

interface TimeOffResponse {
  entries?: TimeOffEntry[];
  data?:    TimeOffEntry[];
  total?:   number;
  summary?: unknown;
}

export interface PartnerTimeOffSyncErgebnis {
  verarbeitet:  number;
  aktualisiert: number;
  uebersprungen: number;
  fehler:       string[];
  hinweis?:     string;
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function extractEntries(raw: unknown): TimeOffEntry[] {
  if (Array.isArray(raw)) return raw as TimeOffEntry[];
  const r = raw as TimeOffResponse;
  return (r?.entries ?? r?.data ?? []) as TimeOffEntry[];
}

function isJsonResponse(data: unknown): boolean {
  return typeof data === 'object' && data !== null;
}

// ─── Haupt-Sync ──────────────────────────────────────────────────────────────

export async function syncPartnerTimeOff(kalenderjahr: number): Promise<PartnerTimeOffSyncErgebnis> {
  const apiKey = process.env.PARTNER_API_KEY;
  if (!apiKey) throw new Error('PARTNER_API_KEY ist nicht konfiguriert');

  const startDate = `${kalenderjahr}-01-01`;
  const endDate   = `${kalenderjahr}-12-31`;

  const fehler: string[] = [];

  // ── 1. Kranktage für das Kalenderjahr laden (serverseitig gefiltert) ──────
  let entries: TimeOffEntry[] = [];

  try {
    const response = await axios.get(`${BASE_URL}/api/partner/time-off`, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      params:  { type: 'sick', startDate, endDate },
      timeout: 30_000,
    });

    if (!isJsonResponse(response.data)) {
      return {
        verarbeitet:   0,
        aktualisiert:  0,
        uebersprungen: 0,
        fehler:        [],
        hinweis:       'time-off Endpunkt nicht verfügbar (kein JSON) — Kranktage nicht synchronisiert',
      };
    }

    entries = extractEntries(response.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      verarbeitet:   0,
      aktualisiert:  0,
      uebersprungen: 0,
      fehler:        [],
      hinweis:       `time-off Endpunkt nicht erreichbar: ${msg} — Kranktage nicht synchronisiert`,
    };
  }

  // ── 2. Alle aktiven MA mit personalNummer auf 0 Kranktage zurücksetzen ───
  // Ohne diesen Reset würden MA ohne Einträge im API-Ergebnis auf dem Wert
  // des Vorjahres verbleiben und ggf. dauerhaft disqualifiziert bleiben.
  await prisma.mitarbeiter.updateMany({
    where: { aktiv: true, personalNummer: { not: null } },
    data:  { kranktageAktuellesJahr: 0 },
  });

  // ── 3. Kranktage je Mitarbeiter aggregieren ───────────────────────────────
  const kranktageJeMA = new Map<string, number>();

  for (const entry of entries) {
    if (typeof entry.employeeNumber !== 'string') continue;
    if (entry.category !== 'sick') continue;

    const tage = entry.days ?? 1;
    kranktageJeMA.set(
      entry.employeeNumber,
      (kranktageJeMA.get(entry.employeeNumber) ?? 0) + tage,
    );
  }

  // ── 4. Tatsächliche Kranktage eintragen ──────────────────────────────────
  let aktualisiert  = 0;
  let uebersprungen = 0;

  for (const [personalNummer, kranktage] of kranktageJeMA.entries()) {
    try {
      const ma = await prisma.mitarbeiter.findUnique({ where: { personalNummer } });

      if (!ma) {
        uebersprungen++;
        continue;
      }

      await prisma.mitarbeiter.update({
        where: { personalNummer },
        data:  { kranktageAktuellesJahr: kranktage },
      });

      aktualisiert++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fehler.push(`Mitarbeiter ${personalNummer}: ${msg}`);
    }
  }

  return {
    verarbeitet:   entries.length,
    aktualisiert,
    uebersprungen,
    fehler,
  };
}
