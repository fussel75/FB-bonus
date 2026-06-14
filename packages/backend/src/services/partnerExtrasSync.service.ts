/**
 * partnerExtrasSync.service.ts
 *
 * Synchronisiert Extrastunden aus der FriStD-Bau Partner-API.
 * Endpunkt: GET /api/partner/extras?startDate=...&endDate=...
 *
 * Was gespeichert wird:
 *   - Je API-Einzelbuchung ein Eintrag in bonusbuchungen (typ='option_a')
 *     mit echtem Datum, Beschreibung (positionDescription / shortText / notes)
 *     und berechnetem Betrag (stunden × stundensatzA)
 *   - erstelltVonId = null  →  markiert Auto-Sync-Einträge
 *   - Vor jedem Sync werden alle Auto-Sync-Einträge des Jahres gelöscht
 *     (idempotent)
 *   - extraStunden in projekt_mitarbeiter wird ZUSÄTZLICH aggregiert
 *     aktualisiert (für Admin-Übersicht)
 *
 * Die Bonus-Berechnung liest Option A ausschließlich aus bonusbuchungen.
 */

import axios from 'axios';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import { konfigService } from './konfiguration.service';

const BASE_URL = 'https://fristd-bau.replit.app';

// ─── Typen ───────────────────────────────────────────────────────────────────

interface ExtrasEntry {
  id?:                  string | number;
  date:                 string;
  hours:                number;
  workerName?:          string;
  employeeNumber:       string;
  projectNumber:        string;
  projectName?:         string;
  trade?:               string;
  positionNumber?:      string;
  positionDescription?: string;
  shortText?:           string;
  notes?:               string | null;
  startTime?:           string;
  endTime?:             string;
}

interface ExtrasResponse {
  extras?:     ExtrasEntry[];
  entries?:    ExtrasEntry[];
  data?:       ExtrasEntry[];
  total?:      number;
  totalHours?: number;
  byEmployee?: unknown[];
}

export interface PartnerExtrasSyncErgebnis {
  eintraege:    number;
  aktualisiert: number;
  uebersprungen: number;
  fehler:       string[];
  hinweis?:     string;
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function extractEntries(raw: unknown): ExtrasEntry[] {
  if (Array.isArray(raw)) return raw as ExtrasEntry[];
  const r = raw as ExtrasResponse;
  return (r?.extras ?? r?.entries ?? r?.data ?? []) as ExtrasEntry[];
}

function isJsonResponse(data: unknown): boolean {
  return typeof data === 'object' && data !== null;
}

function buildBeschreibung(entry: ExtrasEntry): string {
  const parts: string[] = [];
  if (entry.positionDescription?.trim()) parts.push(entry.positionDescription.trim());
  else if (entry.shortText?.trim())       parts.push(entry.shortText.trim());
  if (entry.trade?.trim())               parts.push(entry.trade.trim());
  if (entry.notes?.trim())               parts.push(entry.notes.trim());
  return parts.join(' · ') || 'Extra-Stunden';
}

// ─── Haupt-Sync ──────────────────────────────────────────────────────────────

export async function syncPartnerExtras(kalenderjahr: number): Promise<PartnerExtrasSyncErgebnis> {
  const apiKey = process.env.PARTNER_API_KEY;
  if (!apiKey) throw new Error('PARTNER_API_KEY ist nicht konfiguriert');

  // Stundensatz für Option A aus Konfiguration
  const konfig      = await konfigService.alleWerte();
  const stundensatzA = Number(konfig.stundensatz_option_a) || 10;

  const startDate = `${kalenderjahr}-01-01`;
  const endDate   = `${kalenderjahr}-12-31`;
  const fehler: string[] = [];

  // ── 1. Extrastunden von der Partner-API laden ─────────────────────────────
  let entries: ExtrasEntry[] = [];

  try {
    const response = await axios.get(`${BASE_URL}/api/partner/extras`, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      params:  { startDate, endDate },
      timeout: 30_000,
    });

    if (!isJsonResponse(response.data)) {
      return {
        eintraege:     0,
        aktualisiert:  0,
        uebersprungen: 0,
        fehler:        [],
        hinweis:       'extras Endpunkt nicht verfügbar (kein JSON) — Extrastunden nicht synchronisiert',
      };
    }

    entries = extractEntries(response.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      eintraege:     0,
      aktualisiert:  0,
      uebersprungen: 0,
      fehler:        [],
      hinweis:       `extras Endpunkt nicht erreichbar: ${msg} — Extrastunden nicht synchronisiert`,
    };
  }

  // ── 2. Einträge validieren und anreichern (MA-ID + Projekt-ID nachschlagen)
  interface ValidierterEintrag {
    mitarbeiterId: number;
    projektId:     number;
    stunden:       number;
    buchungsdatum: Date;
    beschreibung:  string;
  }

  const validiert: ValidierterEintrag[] = [];
  let uebersprungen = 0;

  // Cache für Lookups (vermeidet Doppel-DB-Anfragen)
  const maCache      = new Map<string, number | null>();
  const projektCache = new Map<string, number | null>();

  for (const entry of entries) {
    if (typeof entry.employeeNumber !== 'string') { uebersprungen++; continue; }
    if (typeof entry.projectNumber  !== 'string') { uebersprungen++; continue; }
    if (typeof entry.hours          !== 'number' || entry.hours <= 0) { uebersprungen++; continue; }

    // Buchungsdatum validieren
    const parsedDate = entry.date ? new Date(entry.date) : null;
    if (!parsedDate || isNaN(parsedDate.getTime())) { uebersprungen++; continue; }

    // Mitarbeiter nachschlagen (mit Cache)
    if (!maCache.has(entry.employeeNumber)) {
      const ma = await prisma.mitarbeiter.findUnique({ where: { personalNummer: entry.employeeNumber } });
      maCache.set(entry.employeeNumber, ma?.id ?? null);
    }
    const mitarbeiterId = maCache.get(entry.employeeNumber);
    if (!mitarbeiterId) { uebersprungen++; continue; }

    // Projekt nachschlagen (mit Cache)
    if (!projektCache.has(entry.projectNumber)) {
      const p = await prisma.projekt.findUnique({ where: { projektnummer: entry.projectNumber } });
      projektCache.set(entry.projectNumber, p?.id ?? null);
    }
    const projektId = projektCache.get(entry.projectNumber);
    if (!projektId) { uebersprungen++; continue; }

    validiert.push({
      mitarbeiterId,
      projektId,
      stunden:       entry.hours,
      buchungsdatum: parsedDate,
      beschreibung:  buildBeschreibung(entry),
    });
  }

  // ── 3. Auto-Sync-Einträge des Jahres löschen (idempotent) ────────────────
  const betroffeneMAs = [...new Set(validiert.map((v) => v.mitarbeiterId))];

  if (betroffeneMAs.length > 0) {
    await prisma.bonusbuchung.deleteMany({
      where: {
        mitarbeiterId:  { in: betroffeneMAs },
        typ:            'option_a',
        erstelltVonId:  null,
        buchungsdatum: {
          gte: new Date(`${kalenderjahr}-01-01`),
          lte: new Date(`${kalenderjahr}-12-31`),
        },
      },
    });
  }

  // ── 4. Einzelbuchungen in bonusbuchungen einfügen ─────────────────────────
  let eingefuegt = 0;

  for (const v of validiert) {
    try {
      await prisma.bonusbuchung.create({
        data: {
          mitarbeiterId: v.mitarbeiterId,
          projektId:     v.projektId,
          typ:           'option_a',
          stunden:       new Prisma.Decimal(v.stunden),
          betragEur:     new Prisma.Decimal(v.stunden * stundensatzA),
          buchungsdatum: v.buchungsdatum,
          beschreibung:  v.beschreibung,
          erstelltVonId: null,
        },
      });
      eingefuegt++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fehler.push(`Eintrag ${v.mitarbeiterId}/${v.projektId}: ${msg}`);
    }
  }

  // ── 5. extraStunden in projekt_mitarbeiter WEITERHIN aggregiert pflegen ───
  // (für Rückwärtskompatibilität der Admin-Übersicht)
  const aggregiert = new Map<string, number>();
  for (const v of validiert) {
    const key = `${v.mitarbeiterId}::${v.projektId}::${kalenderjahr}`;
    aggregiert.set(key, (aggregiert.get(key) ?? 0) + v.stunden);
  }

  let aktualisiert = 0;

  for (const [key, extraStunden] of aggregiert.entries()) {
    const [maIdStr, projektIdStr, jahrStr] = key.split('::');
    const mitarbeiterId = Number(maIdStr);
    const projektId     = Number(projektIdStr);
    const jahr          = Number(jahrStr);

    try {
      const existiert = await prisma.projektMitarbeiter.findUnique({
        where: { projektId_mitarbeiterId_jahr: { projektId, mitarbeiterId, jahr } },
      });

      if (!existiert) {
        await prisma.projektMitarbeiter.create({
          data: {
            projektId,
            mitarbeiterId,
            jahr,
            istStunden:   new Prisma.Decimal(0),
            extraStunden: new Prisma.Decimal(extraStunden),
          },
        });
      } else {
        await prisma.projektMitarbeiter.update({
          where: { projektId_mitarbeiterId_jahr: { projektId, mitarbeiterId, jahr } },
          data:  { extraStunden: new Prisma.Decimal(extraStunden) },
        });
      }
      aktualisiert++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fehler.push(`extraStunden ${mitarbeiterId}/${projektId}: ${msg}`);
    }
  }

  return {
    eintraege:    entries.length,
    aktualisiert,
    uebersprungen,
    fehler,
  };
}
