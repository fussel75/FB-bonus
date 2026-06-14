/**
 * api/jahresabschluss.ts — Jahresabschluss-API
 *
 * Sensibelster Teil der App: Passwortabfragen, irreversible Aktionen.
 */

import { apiClient } from './client';
import type { BonusJahresübersicht } from '@/types';

// ─── Schritt 1: Vorschau ──────────────────────────────────────────────────────

export interface VorschauAntwort {
  jahr:     number;
  ergebnis: BonusJahresübersicht[];
}

export async function getVorschau(jahr: number): Promise<VorschauAntwort> {
  const r = await apiClient.get(`/admin/jahresabschluss/vorschau?jahr=${jahr}`);
  return r.data.data as VorschauAntwort;
}

// ─── Schritt 3: Freigeben ─────────────────────────────────────────────────────

export interface FreigebenAntwort {
  kalenderjahr:            number;
  verarbeiteteMitarbeiter: number;
  gesamtAuszahlungTopf:    number;
  erstelltAm:              string;
}

export async function postFreigeben(jahr: number, passwort: string): Promise<FreigebenAntwort> {
  const r = await apiClient.post('/admin/jahresabschluss/freigeben', { jahr, passwort });
  return r.data.data as FreigebenAntwort;
}

// ─── Schritt 4: Export (Blob-Download mit Auth-Header) ───────────────────────

export async function downloadExport(jahr: number, format: 'pdf' | 'csv'): Promise<void> {
  const token = localStorage.getItem('bt_token');
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? '/api'}/admin/jahresabschluss/export?jahr=${jahr}&format=${format}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );

  if (!response.ok) throw new Error(`Export fehlgeschlagen: ${response.status}`);

  const blob     = await response.blob();
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = `bonustrack_${jahr}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Halbjahresabschluss ─────────────────────────────────────────────────────

export interface HalbjahrAntwort {
  kalenderjahr:            number;
  verarbeiteteMitarbeiter: number;
  gesamtH1Topf:            number;
  erstelltAm:              string;
}

export async function postHalbjahr(jahr: number, passwort: string): Promise<HalbjahrAntwort> {
  const r = await apiClient.post('/admin/jahresabschluss/halbjahr', { jahr, passwort });
  return r.data.data as HalbjahrAntwort;
}

// ─── Schritt 5: Jahresreset ───────────────────────────────────────────────────

export interface ResetAntwort {
  message:        string;
  kranktageReset: boolean;
}

export async function postReset(jahr: number, passwort: string): Promise<ResetAntwort> {
  const r = await apiClient.post('/admin/jahresabschluss/reset', { jahr, passwort });
  return r.data.data as ResetAntwort;
}
