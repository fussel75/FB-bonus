/**
 * api/admin.ts — Admin-API-Calls
 *
 * Alle Endpunkte die Admin-JWT voraussetzen.
 */

import { apiClient as api } from './client';
import type {
  BonusUebersicht,
  SyncLog,
  Mitarbeiter,
  Projekt,
  KonfigWerte,
  Auszahlung,
  PrognoseErgebnis,
} from '@/types';

// ─── Bonus ───────────────────────────────────────────────────────────────────

export async function getBonusUebersicht(jahr: number): Promise<BonusUebersicht> {
  const r = await api.get(`/bonus/uebersicht?jahr=${jahr}`);
  return r.data.data as BonusUebersicht;
}

export async function getBonusBuchungen(mitarbeiterId: number, jahr: number): Promise<import('@/types').BonusBuchungshistorie> {
  const r = await api.get(`/bonus/${mitarbeiterId}?jahr=${jahr}&typ=option_a`);
  return r.data.data;
}

export async function postBonusBerechnen(jahr: number): Promise<BonusUebersicht['mitarbeiter']> {
  const r = await api.post(`/bonus/berechnen?jahr=${jahr}`);
  return r.data.data;
}

export interface OptionABuchungInput {
  mitarbeiterId: number;
  stunden:       number;
  buchungsdatum: string;
  beschreibung?: string;
  projektId?:    number;
}

export async function postOptionABuchung(input: OptionABuchungInput): Promise<void> {
  await api.post('/bonus/option-a', input);
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export async function getSyncStatus(): Promise<SyncLog[]> {
  const r = await api.get('/sync/status');
  return r.data.data as SyncLog[];
}

export async function triggerSync(): Promise<{ synced: number; fehler: number }> {
  const r = await api.post('/sync');
  return r.data.data;
}

export async function triggerExtrasSync(jahr: number): Promise<{ eintraege: number; aktualisiert: number; kalenderjahr: number }> {
  const r = await api.post(`/sync/extras?jahr=${jahr}`);
  return r.data.data;
}

// ─── Mitarbeiter ──────────────────────────────────────────────────────────────

export async function getMitarbeiterListe(): Promise<Mitarbeiter[]> {
  const r = await api.get('/mitarbeiter');
  return r.data.data as Mitarbeiter[];
}

export async function patchMitarbeiter(
  id: number,
  data: {
    kranktageAktuellesJahr?:   number;
    rolleId?:                  number;
    auszahlungspraeferenz?:    string;
    eintrittsdatum?:           string | null;
    austrittsdatum?:           string | null;
    stundenlohnBrutto?:        number | null;
    tagesstundenDurchschnitt?: number | null;
  },
): Promise<Mitarbeiter> {
  const r = await api.patch(`/mitarbeiter/${id}`, data);
  return r.data.data as Mitarbeiter;
}

export interface Rolle {
  id:          number;
  bezeichnung: string;
  faktor:      number;
  _count?:     { mitarbeiter: number };
}

export async function getRollen(): Promise<Rolle[]> {
  const r = await api.get('/rollen');
  return r.data.data;
}

export async function createRolle(bezeichnung: string, faktor: number): Promise<Rolle> {
  const r = await api.post('/rollen', { bezeichnung, faktor });
  return r.data.data;
}

export async function updateRolle(id: number, data: { bezeichnung?: string; faktor?: number }): Promise<Rolle> {
  const r = await api.patch(`/rollen/${id}`, data);
  return r.data.data;
}

export async function deleteRolle(id: number): Promise<void> {
  await api.delete(`/rollen/${id}`);
}

// ─── Projekte ─────────────────────────────────────────────────────────────────

export interface ProjektMitStunden extends Projekt {
  archiviert: boolean;
  mitarbeiterStunden: {
    mitarbeiterId:  number;
    istStunden:     number;
    extraStunden:   number;
    mitarbeiter:    Mitarbeiter;
  }[];
}

export async function getProjekteListe(): Promise<ProjektMitStunden[]> {
  const r = await api.get('/projekte');
  return r.data.data as ProjektMitStunden[];
}

export async function getProjektDetail(id: number): Promise<ProjektMitStunden> {
  const r = await api.get(`/projekte/${id}`);
  return r.data.data as ProjektMitStunden;
}

export async function toggleBonusAusschluss(id: number): Promise<{ bonusAusgeschlossen: boolean }> {
  const r = await api.patch(`/projekte/${id}/bonus-ausschluss`);
  return r.data.data as { bonusAusgeschlossen: boolean };
}

export async function setAbrechnungsjahr(id: number, jahr: number | null): Promise<{ abrechnungsJahr: number | null }> {
  const r = await api.patch(`/projekte/${id}/abrechnungsjahr`, { jahr });
  return r.data.data as { abrechnungsJahr: number | null };
}

export async function toggleArchiviert(id: number, archiviert: boolean): Promise<{ archiviert: boolean }> {
  const r = await api.patch(`/projekte/${id}/archivieren`, { archiviert });
  return r.data.data as { archiviert: boolean };
}

export async function getArchiv(): Promise<ProjektMitStunden[]> {
  const r = await api.get('/projekte/archiv');
  return r.data.data as ProjektMitStunden[];
}

// ─── Konfiguration ────────────────────────────────────────────────────────────

export async function getKonfiguration(): Promise<KonfigWerte> {
  const r = await api.get('/konfiguration');
  return r.data.data as KonfigWerte;
}

export async function putKonfiguration(key: string, value: string): Promise<void> {
  await api.put('/konfiguration', { key, value });
}

export async function putApiKey(apiKey: string): Promise<void> {
  await api.put('/konfiguration/api-key', { apiKey });
}

export async function uploadLogo(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('logo', file);
  const r = await api.post('/upload/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return (r.data as { data: { url: string } }).data.url;
}

export interface KonfigLogEintrag {
  id:         number;
  key:        string;
  alterWert:  string | null;
  neuerWert:  string;
  geaendertVon: string;
  geaendertAm:  string;
}

export async function getKonfigLog(): Promise<KonfigLogEintrag[]> {
  const r = await api.get('/konfiguration/log');
  return r.data.data as KonfigLogEintrag[];
}

// ─── Auszahlungen ────────────────────────────────────────────────────────────

export async function getAuszahlungen(jahr: number): Promise<Auszahlung[]> {
  const r = await api.get(`/auszahlungen?jahr=${jahr}`);
  return r.data.data as Auszahlung[];
}

export async function genehmigeAuszahlung(id: number): Promise<Auszahlung> {
  const r = await api.post(`/auszahlungen/${id}/genehmigen`);
  return r.data.data as Auszahlung;
}

export async function ausgezahltAuszahlung(id: number, zahlungsnachweis?: string): Promise<Auszahlung> {
  const r = await api.post(`/auszahlungen/${id}/ausgezahlt`, { zahlungsnachweis });
  return r.data.data as Auszahlung;
}

export async function storniereAuszahlung(id: number): Promise<Auszahlung> {
  const r = await api.post(`/auszahlungen/${id}/stornieren`);
  return r.data.data as Auszahlung;
}

export async function bulkGenehmigeAuszahlungen(ids: number[]): Promise<{ aktualisiert: number }> {
  const r = await api.post('/auszahlungen/bulk-genehmigen', { ids });
  return r.data.data;
}

// ─── Prognose ────────────────────────────────────────────────────────────────

export interface PrognoseAntwort {
  ergebnisse:       PrognoseErgebnis[];
  gesamtPrognose:   number;
  gesamtMin:        number;
  gesamtMax:        number;
  jahresfortschritt: number;
}

export async function getPrognose(jahr: number): Promise<PrognoseAntwort> {
  const r = await api.get(`/prognose?jahr=${jahr}`);
  return r.data.data as PrognoseAntwort;
}

export async function getProjektSensitivitaet(jahr: number): Promise<import('@/types').ProjektSensitivitaetAntwort> {
  const r = await api.get(`/prognose/projekte?jahr=${jahr}`);
  return r.data.data as import('@/types').ProjektSensitivitaetAntwort;
}

export async function postSimulation(
  jahr: number,
  overrides: { projektId: number; abschlussAuslastungProzent: number }[],
): Promise<import('@/types').SimulationsErgebnis> {
  const r = await api.post('/prognose/simulation', { jahr, overrides });
  return r.data.data as import('@/types').SimulationsErgebnis;
}
