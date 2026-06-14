/**
 * sync.job.ts
 *
 * Cron-Job für den automatischen API-Sync.
 * Cron-Ausdruck wird aus der Konfigurationstabelle geladen.
 * Bei Änderung des Ausdrucks im Admin: restartMitNeuemAusdruck() aufrufen.
 */

import cron from 'node-cron';
import { konfigService } from '../services/konfiguration.service';
import { syncService } from '../services/sync.service';

const FALLBACK_CRON = '0 6 * * *';  // tägl. 06:00

let aktuellerTask: cron.ScheduledTask | null = null;
let aktuellerAusdruck = '';

async function ladeAusdruck(): Promise<string> {
  try {
    const ausdruck = await konfigService.getWert('sync_cron_ausdruck');
    const kandidat = ausdruck?.trim() ?? FALLBACK_CRON;

    if (!cron.validate(kandidat)) {
      console.warn(`[Sync-Job] Ungültiger Cron-Ausdruck "${kandidat}" — Fallback: ${FALLBACK_CRON}`);
      return FALLBACK_CRON;
    }

    return kandidat;
  } catch {
    return FALLBACK_CRON;
  }
}

async function starteTask(ausdruck: string): Promise<void> {
  // Bestehenden Task sauber stoppen
  if (aktuellerTask) {
    aktuellerTask.stop();
    aktuellerTask = null;
  }

  aktuellerAusdruck = ausdruck;

  aktuellerTask = cron.schedule(ausdruck, async () => {
    console.log(`[Sync-Job] Automatischer Sync gestartet (${new Date().toISOString()})`);
    try {
      await syncService.syncNow(false);
    } catch (err) {
      // Fehler wird im SyncLog gespeichert — Job läuft weiter
      console.error('[Sync-Job] Sync fehlgeschlagen:', err instanceof Error ? err.message : err);
    }
  });

  console.log(`  ⏰ Sync-Cron aktiv: "${ausdruck}"`);
}

export const syncJob = {
  async start(): Promise<void> {
    const ausdruck = await ladeAusdruck();
    await starteTask(ausdruck);
  },

  stop(): void {
    if (aktuellerTask) {
      aktuellerTask.stop();
      aktuellerTask = null;
      console.log('[Sync-Job] Gestoppt');
    }
  },

  // Wird aus der Konfigurationsroute aufgerufen wenn sync_cron_ausdruck geändert wird
  async restartMitNeuemAusdruck(): Promise<void> {
    const ausdruck = await ladeAusdruck();
    if (ausdruck === aktuellerAusdruck) return;  // nichts geändert
    console.log(`[Sync-Job] Neustart mit neuem Ausdruck: "${ausdruck}"`);
    await starteTask(ausdruck);
  },

  getAktuellerAusdruck(): string {
    return aktuellerAusdruck;
  },
};
