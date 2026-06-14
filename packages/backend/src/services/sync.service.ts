/**
 * sync.service.ts
 *
 * Orchestriert den vollständigen Daten-Sync von der FriStD-Bau Partner-API:
 *   1. Mitarbeiter    — /api/partner/employees
 *   2. Projekte       — /api/partner/projects + /api/partner/projects/:id/timeentries
 *   3. Kranktage      — /api/partner/time-off?type=sick (graceful fallback wenn nicht verfügbar)
 *   4. Extrastunden   — /api/partner/extras (graceful fallback wenn nicht verfügbar)
 *
 * Regeln:
 *   - Reihenfolge: Mitarbeiter zuerst (Projekte referenzieren MA via personalNummer)
 *   - Fehler in Teilsyncs werden geloggt, brechen den Gesamt-Sync nicht ab
 *   - SyncLog wird immer geschrieben (auch bei Teilfehlern)
 */

import { SyncStatus } from '@prisma/client';
import { prisma } from '../db/client';
import { syncPartnerEmployees }  from './partnerEmployeeSync.service';
import { syncPartnerProjects }   from './partnerProjectSync.service';
import { syncPartnerTimeOff }    from './partnerTimeOffSync.service';
import { syncPartnerExtras }     from './partnerExtrasSync.service';
import { syncPartnerWurst }      from './partnerWurstSync.service';

// ─── Ergebnis-Typ ─────────────────────────────────────────────────────────────

export interface SyncErgebnis {
  mitarbeiter:              number;
  maAngelegt:               number;
  maAktualisiert:           number;
  projekte:                 number;
  projAngelegt:             number;
  projAktualisiert:         number;
  kranktageAktualisiert:    number;
  extrasAktualisiert:       number;
  wurstAktualisiert:        number;
  wurstOffeneStunden:       number;
  dauer_ms:                 number;
  warnungen:                string[];
}

// ─── Haupt-Export ─────────────────────────────────────────────────────────────

export const syncService = {
  async syncNow(manuell: boolean): Promise<SyncErgebnis> {
    const startzeit = Date.now();
    const warnungen: string[] = [];

    const log = await prisma.syncLog.create({
      data: { status: SyncStatus.laufend, manuell },
    });

    console.log(`[Sync] Starte ${manuell ? 'manuellen' : 'automatischen'} Partner-Sync (Log-ID: ${log.id})`);

    try {
      // ── 1. Mitarbeiter (muss zuerst laufen — Projekte referenzieren MA) ──
      console.log('[Sync] Schritt 1/5: Mitarbeiter...');
      const maErgebnis = await syncPartnerEmployees();

      if (maErgebnis.fehler.length > 0) {
        warnungen.push(...maErgebnis.fehler.map((f) => `[MA] ${f}`));
      }

      console.log(
        `[Sync] Mitarbeiter: ${maErgebnis.angelegt} neu / ${maErgebnis.aktualisiert} aktualisiert` +
        (maErgebnis.fehler.length > 0 ? ` (${maErgebnis.fehler.length} Warnungen)` : ''),
      );

      // ── 2. Projekte + Stunden ─────────────────────────────────────────────
      console.log('[Sync] Schritt 2/5: Projekte & Stunden...');
      const projErgebnis = await syncPartnerProjects();

      if (projErgebnis.fehler.length > 0) {
        warnungen.push(...projErgebnis.fehler.map((f) => `[Proj] ${f}`));
      }

      console.log(
        `[Sync] Projekte: ${projErgebnis.angelegt} neu / ${projErgebnis.aktualisiert} aktualisiert` +
        (projErgebnis.fehler.length > 0 ? ` (${projErgebnis.fehler.length} Warnungen)` : ''),
      );

      // ── 3. Kranktage (graceful — Endpunkt evtl. noch nicht verfügbar) ────
      console.log('[Sync] Schritt 3/5: Kranktage...');
      const aktuellesJahr = new Date().getFullYear();
      const timeOffErgebnis = await syncPartnerTimeOff(aktuellesJahr);

      if (timeOffErgebnis.hinweis) {
        console.warn(`[Sync] ${timeOffErgebnis.hinweis}`);
        warnungen.push(`[TimeOff] ${timeOffErgebnis.hinweis}`);
      }

      if (timeOffErgebnis.fehler.length > 0) {
        warnungen.push(...timeOffErgebnis.fehler.map((f) => `[TimeOff] ${f}`));
      }

      console.log(
        `[Sync] Kranktage: ${timeOffErgebnis.aktualisiert} Mitarbeiter aktualisiert`,
      );

      // ── 4. Extrastunden (graceful — Endpunkt evtl. noch nicht verfügbar) ─
      console.log('[Sync] Schritt 4/5: Extrastunden...');  // Bug 10 Fix: 4/5 war korrekt
      const extrasErgebnis = await syncPartnerExtras(aktuellesJahr);

      if (extrasErgebnis.hinweis) {
        console.warn(`[Sync] ${extrasErgebnis.hinweis}`);
        warnungen.push(`[Extras] ${extrasErgebnis.hinweis}`);
      }

      if (extrasErgebnis.fehler.length > 0) {
        warnungen.push(...extrasErgebnis.fehler.map((f) => `[Extras] ${f}`));
      }

      console.log(
        `[Sync] Extrastunden: ${extrasErgebnis.eintraege} Einträge / ${extrasErgebnis.aktualisiert} Mitarbeiter aktualisiert`,
      );

      // ── 5. Wurststunden (graceful — Endpunkt evtl. noch nicht verfügbar) ─
      console.log('[Sync] Schritt 5/5: Wurststunden...');
      const wurstErgebnis = await syncPartnerWurst(aktuellesJahr);

      if (wurstErgebnis.hinweis) {
        console.warn(`[Sync] ${wurstErgebnis.hinweis}`);
        warnungen.push(`[Wurst] ${wurstErgebnis.hinweis}`);
      }

      if (wurstErgebnis.fehler.length > 0) {
        warnungen.push(...wurstErgebnis.fehler.map((f) => `[Wurst] ${f}`));
      }

      console.log(
        `[Sync] Wurststunden: ${wurstErgebnis.aktualisiert} Mitarbeiter / ${wurstErgebnis.offeneStunden} h offen`,
      );

      // ── Fertig ────────────────────────────────────────────────────────────
      const dauer_ms = Date.now() - startzeit;

      const fehlermeldung = warnungen.length > 0
        ? `${warnungen.length} Warnungen: ${warnungen.slice(0, 5).join(' | ')}${warnungen.length > 5 ? ` ... (${warnungen.length - 5} weitere)` : ''}`
        : null;

      const hatDaten = maErgebnis.gesamt > 0 || projErgebnis.projekte > 0;
      const finalStatus = hatDaten ? SyncStatus.erfolgreich : SyncStatus.fehlgeschlagen;

      await prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status:     finalStatus,
          finishedAt: new Date(),
          fehler:     fehlermeldung,
        },
      });

      const ergebnis: SyncErgebnis = {
        mitarbeiter:              maErgebnis.gesamt,
        maAngelegt:               maErgebnis.angelegt,
        maAktualisiert:           maErgebnis.aktualisiert,
        projekte:                 projErgebnis.projekte,
        projAngelegt:             projErgebnis.angelegt,
        projAktualisiert:         projErgebnis.aktualisiert,
        kranktageAktualisiert:    timeOffErgebnis.aktualisiert,
        extrasAktualisiert:       extrasErgebnis.aktualisiert,
        wurstAktualisiert:        wurstErgebnis.aktualisiert,
        wurstOffeneStunden:       wurstErgebnis.offeneStunden,
        dauer_ms,
        warnungen,
      };

      console.log(
        `[Sync] ✅ Fertig in ${dauer_ms}ms — ` +
        `MA: ${maErgebnis.angelegt} neu / ${maErgebnis.aktualisiert} akt | ` +
        `Projekte: ${projErgebnis.angelegt} neu / ${projErgebnis.aktualisiert} akt | ` +
        `Kranktage: ${timeOffErgebnis.aktualisiert} akt | ` +
        `Extras: ${extrasErgebnis.aktualisiert} akt`,
      );

      return ergebnis;
    } catch (err) {
      const fehler = err instanceof Error ? err.message : String(err);

      await prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status:     SyncStatus.fehlgeschlagen,
          finishedAt: new Date(),
          fehler,
        },
      });

      console.error('[Sync] ❌ Sync fehlgeschlagen:', fehler);
      throw err;
    }
  },
};
