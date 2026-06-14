import { Request } from 'express';
import { AdminRolle } from '@prisma/client';

// ─── JWT Payload ─────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub:   number;        // Admin-User-ID
  email: string;
  rolle: AdminRolle;
  name:  string;
  iat?:  number;
  exp?:  number;
}

export interface MitarbeiterJwtPayload {
  sub:   number;        // Mitarbeiter-ID
  name:  string;
  typ:   'mitarbeiter';
  iat?:  number;
  exp?:  number;
}

// ─── Express Request mit Auth-Kontext ────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  admin?: JwtPayload;
}

export interface MitarbeiterRequest extends Request {
  mitarbeiter?: MitarbeiterJwtPayload;
}

// ─── API-Responses ───────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error:   string;
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Bonus-Berechnungen ──────────────────────────────────────────────────────

export interface BonusProjektDetail {
  projektId:          number;
  projektname:        string;
  sollStunden:        number;
  istStunden:         number;
  saldo:              number;       // positiv = Effizienzgewinn
  punkte:             number;       // geleistete_h × Rollenfaktor
  anteilProzent:      number;       // punkte / summe_punkte_projekt * 100
  guthabenStunden:    number;       // saldo × anteil
  guthabenEur:        number;       // wird erst bei Jahresabschluss berechnet
  extraStunden?:      number;       // Option A: Überstunden aus ProjektMitarbeiter
  istBonusrelevant:   boolean;      // true wenn Auslastung >= Schwellenwert oder abgeschlossen
  auslastungProzent:  number;       // istStunden / sollStunden * 100
}

export interface BonusJahresübersicht {
  mitarbeiterId:       number;
  mitarbeiterName:     string;
  kalenderjahr:        number;
  optionA_stunden:     number;
  optionA_betrag:      number;       // nach Krankheits-Kürzung
  optionB_jahressaldo: number;       // Summe aller Projektguthaben (Boden: 0)
  optionB_betrag:      number;       // nach Krankheits-Kürzung
  gesamtBetrag:        number;       // ausgezahlter Bonus (nach Kürzung; 0 wenn !qualifiziert)
  gesamtBrutto:        number;       // Bonus vor Krankheits-Kürzung
  qualifiziert:             boolean;
  disqualGrund?:            string;   // z.B. "Kranktage überschritten"
  projekte:                 BonusProjektDetail[];
  mindestAuslastungProzent: number;   // konfigurierter Schwellenwert (z.B. 90)
  wurst_abzug_stunden:      number;   // offene Wurststunden (Abzug von Option A)
  wurst_abzug_betrag:       number;   // Abzug in € (wurst_abzug_stunden × stundensatzA)
  kranktage:                number;   // aus ma.kranktageAktuellesJahr
  kranken_faktor_prozent:   number;   // z.B. 80 für 80 % Auszahlungsanteil
  kranken_kuerzung_eur:     number;   // gesamtBrutto - gesamtBetrag
  efzg_aktiv:               boolean;  // ob § 4a EFZG-Schutz aktiv ist
  efzg_max_kuerzung_eur:    number | null; // max. zulässige Kürzung nach § 4a (oder null)
}

export interface PrognoseErgebnis {
  mitarbeiterId:       number;
  mitarbeiterName:     string;
  prognoseBetrag:      number;
  minSzenario:         number;
  maxSzenario:         number;
  risikoStundenPuffer: number;  // Wieviele h darf Projekt noch überziehen
}

// ─── Konfiguration ───────────────────────────────────────────────────────────

export interface KonfigWerte {
  stundensatz_option_b:                    number;
  stundensatz_option_a:                    number;
  kranktage_schwellenwert:                 number;
  kranktage_karenz:                        number;
  kranktage_abzug_pro_tag_prozent:         number;
  kranktage_max_grenze:                    number;
  kranktage_efzg_schutz_aktiv:             boolean;
  kranktage_efzg_tagesfaktor:              number;
  mindest_betriebszugehoerigkeit_monate:   number;
  ganzjahres_bedingung_mindest_monate_im_jahr: number;
  auszahlungsstichtag:                     string;
  unternehmensname:                        string;
  unternehmens_logo_url:                   string;
  api_endpoint_url:                        string;
  sync_cron_ausdruck:                      string;
  rollenfaktor_min:                        number;
}

// ─── Externe API-Formate (Anpassung an echte API nötig) ──────────────────────

export interface ExterneMitarbeiterDaten {
  id:            number;
  vorname:       string;
  nachname:      string;
  rolle:         string;          // Rollenbezeichnung als String
  eintrittsdatum: string;         // ISO-Date
  kranktage:     number;
  aktiv:         boolean;
}

export interface ExterneProjektDaten {
  id:              number;
  projektnummer:   string;
  projektname:     string;
  soll_stunden:    number;
  ist_stunden:     number;
  status:          'aktiv' | 'abgeschlossen' | 'pausiert';
  mitarbeiter_stunden: Array<{
    mitarbeiter_id: number;
    ist_stunden:    number;
  }>;
}
