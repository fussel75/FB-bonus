// ─── Auth ────────────────────────────────────────────────────────────────────

export type AdminRolle = 'superadmin' | 'admin';
export type UserTyp    = 'admin' | 'mitarbeiter';

export interface AdminUser {
  id:    number;
  name:  string;
  email: string;
  rolle: AdminRolle;
}

export interface MitarbeiterUser {
  id:      number;
  vorname: string;
  nachname: string;
  rolle:   string;
}

// ─── API-Responses ────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data:    T;
}

export interface ApiError {
  success: false;
  error:   string;
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Bonus ────────────────────────────────────────────────────────────────────

export interface BonusProjektDetail {
  projektId:          number;
  projektname:        string;
  sollStunden:        number;
  istStunden:         number;
  saldo:              number;
  punkte:             number;
  anteilProzent:      number;
  guthabenStunden:    number;
  guthabenEur:        number;
  extraStunden?:      number;
  istBonusrelevant:   boolean;
  auslastungProzent:  number;
}

export interface BonusJahresübersicht {
  mitarbeiterId:       number;
  mitarbeiterName:     string;
  kalenderjahr:        number;
  optionA_stunden:     number;
  optionA_betrag:      number;
  optionB_jahressaldo: number;
  optionB_betrag:      number;
  gesamtBetrag:        number;
  gesamtBrutto:        number;
  qualifiziert:             boolean;
  disqualGrund?:            string;
  projekte:                 BonusProjektDetail[];
  mindestAuslastungProzent: number;
  wurst_abzug_stunden:      number;
  wurst_abzug_betrag:       number;
  kranktage:                number;
  kranken_faktor_prozent:   number;
  kranken_kuerzung_eur:     number;
  efzg_aktiv:               boolean;
  efzg_max_kuerzung_eur:    number | null;
}

export interface BonusBuchung {
  id:            number;
  typ:           'option_a' | 'option_b';
  stunden:       number;
  betragEur:     number;
  buchungsdatum: string;
  beschreibung:  string | null;
  projekt:       { id: number; projektname: string; projektnummer: string } | null;
}

export interface BonusBuchungshistorie {
  mitarbeiterId: number;
  kalenderjahr:  number;
  summeOptionA:  number;
  summeOptionB:  number;
  summeGesamt:   number;
  buchungen:     BonusBuchung[];
}

export interface BonusUebersicht {
  kalenderjahr:            number;
  gesamtTopf:              number;
  topfOptionA:             number;
  topfOptionB:             number;
  anzahlMitarbeiter:       number;
  anzahlQualifiziert:      number;
  anzahlNichtQualifiziert: number;
  mitarbeiter:             BonusJahresübersicht[];
}

// ─── Mitarbeiter ─────────────────────────────────────────────────────────────

export interface Rolle {
  id:          number;
  bezeichnung: string;
  faktor:      number;
}

export interface Mitarbeiter {
  id:                       number;
  vorname:                  string;
  nachname:                 string;
  email:                    string | null;
  externeId:                string | null;
  personalNummer:           string | null;
  rolleId:                  number;
  rolle:                    Rolle;
  eintrittsdatum:           string | null;
  austrittsdatum:           string | null;
  kranktageAktuellesJahr:   number;
  auszahlungspraeferenz:    'geld' | 'freizeit';
  aktiv:                    boolean;
  zuletztSynchronisiert:    string;
  // Prisma serialisiert Decimal als String über die API
  stundenlohnBrutto:        number | string | null;
  tagesstundenDurchschnitt: number | string | null;
}

export interface MitarbeiterMe {
  id:                     number;
  vorname:                string;
  nachname:               string;
  rolle:                  Rolle;
  eintrittsdatum:         string;
  kranktageAktuellesJahr: number;
  kranktageSchwell:       number;
  kranktageMaxGrenze:     number;
  kranktageProz:          number;
  auszahlungspraeferenz:  'geld' | 'freizeit';
  aktiv:                  boolean;
}

// ─── Projekte ─────────────────────────────────────────────────────────────────

export type ProjektStatus = 'aktiv' | 'abgeschlossen' | 'pausiert';

export interface Projekt {
  id:                  number;
  projektnummer:       string;
  projektname:         string;
  sollStunden:         number;
  istStundenGesamt:    number;
  status:              ProjektStatus;
  bonusAusgeschlossen: boolean;
  abrechnungsJahr:     number | null;
}

// ─── Konfiguration ────────────────────────────────────────────────────────────

export interface KonfigWerte {
  stundensatz_option_b:                  number;
  stundensatz_option_a:                  number;
  stundensatzb_stufe1_bis:               number;
  stundensatzb_stufe1_satz:              number;
  stundensatzb_stufe2_bis:               number;
  stundensatzb_stufe2_satz:              number;
  stundensatzb_stufe3_satz:              number;
  kranktage_schwellenwert:               number;
  kranktage_karenz:                      number;
  kranktage_abzug_pro_tag_prozent:       number;
  kranktage_max_grenze:                  number;
  kranktage_efzg_schutz_aktiv:           string;   // 'true' | 'false' (Roh-Konfigwert)
  kranktage_efzg_tagesfaktor:            number;
  mindest_betriebszugehoerigkeit_monate: number;
  ganzjahres_bedingung_aktiv:            string;   // 'true' | 'false'
  ganzjahres_bedingung_mindest_monate_im_jahr: number;
  auszahlungsstichtag:                   string;
  unternehmensname:                      string;
  unternehmens_logo_url:                 string;
  api_endpoint_url:                      string;
  sync_cron_ausdruck:                    string;
  rollenfaktor_min:                      number;
  sync_cron_ausdruck_aktiv:              string;
  saldo_berechnungsmethode:              string;
  halbjahresauszahlung_aktiv:            string;
  mindest_auslastung_bonusrelevant:      number;
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export type SyncStatus = 'laufend' | 'erfolgreich' | 'fehlgeschlagen';

export interface SyncLog {
  id:         number;
  startedAt:  string;
  finishedAt: string | null;
  status:     SyncStatus;
  fehler:     string | null;
  manuell:    boolean;
}

// ─── Auszahlungen ────────────────────────────────────────────────────────────

export type AuszahlungStatus = 'ausstehend' | 'genehmigt' | 'ausgezahlt' | 'storniert';

export interface Auszahlung {
  id:              number;
  mitarbeiterId:   number;
  kalenderjahr:    number;
  betragOptionA:   number;
  betragOptionB:   number;
  betragGesamt:    number;
  status:          AuszahlungStatus;
  genehmigtAm:     string | null;
  ausgezahltAm:    string | null;
  zahlungsnachweis: string | null;
  mitarbeiter:     Mitarbeiter;
}

// ─── Prognose ────────────────────────────────────────────────────────────────

export interface PrognoseErgebnis {
  mitarbeiterId:       number;
  mitarbeiterName:     string;
  prognoseBetrag:      number;
  minSzenario:         number;
  maxSzenario:         number;
  risikoStundenPuffer: number;
}

// ─── Prognose Projekt-Sensitivität (Schritt 10) ───────────────────────────────

export interface MitarbeiterPuffer {
  mitarbeiterId:   number;
  mitarbeiterName: string;
  istStunden:      number;
  anteilProz:      number;
  pufferStunden:   number;
  guthabenAktuell: number;
}

export interface ProjektSensitivitaet {
  projektId:           number;
  projektnummer:       string;
  projektname:         string;
  sollStunden:         number;
  istStunden:          number;
  saldo:               number;
  auslastungProz:      number;
  nochNichtBegonnen:   boolean;
  abgeschlossen:       boolean;
  bonusAusgeschlossen: boolean;
  mitarbeiter:         MitarbeiterPuffer[];
}

export interface ProjektSensitivitaetAntwort {
  kalenderjahr:        number;
  jahresfortschritt:   number;
  gesamtPufferStunden: number;
  kritischeProjekte:   number;
  projekte:            ProjektSensitivitaet[];
}

// ─── Prognosesimulation ───────────────────────────────────────────────────────

export interface SimulationsMAErgebnis {
  mitarbeiterId:     number;
  mitarbeiterName:   string;
  optionA_betrag:    number;
  optionB_aktuell:   number;
  optionB_simuliert: number;
  gesamt_aktuell:    number;
  gesamt_simuliert:  number;
  differenz:         number;
  qualifiziert:      boolean;
}

export interface SimulationsErgebnis {
  mitarbeiter:      SimulationsMAErgebnis[];
  gesamt_aktuell:   number;
  gesamt_simuliert: number;
}
