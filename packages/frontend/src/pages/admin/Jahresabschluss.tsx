/**
 * Admin — Jahresabschluss-Wizard (Schritt 8)
 *
 * 5-Schritt-Flow:
 *   1. Vorschau         — Berechnete Ansprüche aller Mitarbeiter
 *   2. Überprüfung      — Admin-Kommentare + Bestätigungs-Checkbox
 *   3. Passwort         — Superadmin-Passwort als Zwei-Schritt-Absicherung
 *   4. Freigabe         — Irreversible Buchung, Fortschrittsanzeige, Zusammenfassung
 *   5. Export & Reset   — PDF/CSV-Download, Jahresreset mit doppelter Bestätigung
 *
 * Sicherheits-Regeln:
 *   - Schritt 4 (Freigabe) kann nicht rückgängig gemacht werden
 *   - Reset erfordert separates Passwort + „Ich verstehe"-Checkbox
 *   - Passwortfelder werden nach Verwendung sofort geleert
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonCard, SkeletonRow } from '@/components/ui/Skeleton';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import {
  getVorschau,
  postFreigeben,
  downloadExport,
  postReset,
  postHalbjahr,
  type VorschauAntwort,
  type FreigebenAntwort,
  type HalbjahrAntwort,
} from '@/api/jahresabschluss';
import { getProjekteListe, getKonfiguration } from '@/api/admin';
import type { Projekt } from '@/types';

// ─── Schritt-Indikator ────────────────────────────────────────────────────────

const SCHRITTE = [
  { nr: 1, label: 'Vorschau'    },
  { nr: 2, label: 'Überprüfung' },
  { nr: 3, label: 'Passwort'    },
  { nr: 4, label: 'Freigabe'    },
  { nr: 5, label: 'Export'      },
];

function SchrittIndikator({ aktiv, abgeschlossen }: { aktiv: number; abgeschlossen: Set<number> }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {SCHRITTE.map((s, i) => {
        const done    = abgeschlossen.has(s.nr);
        const current = s.nr === aktiv;

        return (
          <div key={s.nr} className="flex items-center flex-1 last:flex-none">
            {/* Kreis */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  done    ? 'bg-bonus-500 text-white' :
                  current ? 'bg-info-600  text-white ring-4 ring-info-100' :
                  'bg-gray-100 text-gray-400'
                }`}
              >
                {done ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : s.nr}
              </div>
              <span className={`text-xs hidden sm:block ${current ? 'text-info-700 font-medium' : done ? 'text-bonus-600' : 'text-gray-400'}`}>
                {s.label}
              </span>
            </div>
            {/* Verbindungslinie */}
            {i < SCHRITTE.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 transition-colors ${done ? 'bg-bonus-400' : 'bg-gray-100'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function eur(n: number) {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

// ─── Schritt 1: Vorschau ──────────────────────────────────────────────────────

function Schritt1Vorschau({
  vorschau,
  aktiveProjekte,
  onWeiter,
  onZeigeProjekte,
}: {
  vorschau:          VorschauAntwort;
  aktiveProjekte:    Projekt[];
  onWeiter:          () => void;
  onZeigeProjekte:   () => void;
}) {
  const qualifiziert    = vorschau.ergebnis.filter((e) => e.qualifiziert);
  const nichtQualif     = vorschau.ergebnis.filter((e) => !e.qualifiziert);
  const gesamtTopf      = qualifiziert.reduce((s, e) => s + e.gesamtBetrag, 0);
  const topfA           = qualifiziert.reduce((s, e) => s + e.optionA_betrag, 0);
  const topfB           = qualifiziert.reduce((s, e) => s + e.optionB_betrag, 0);

  const sortiert = [...vorschau.ergebnis].sort((a, b) => {
    if (a.qualifiziert && !b.qualifiziert) return -1;
    if (!a.qualifiziert && b.qualifiziert)  return  1;
    return b.gesamtBetrag - a.gesamtBetrag;
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Schritt 1 — Vorschau</h2>
        <p className="text-sm text-gray-500 mt-1">
          Berechnete Bonus-Ansprüche für das Jahr {vorschau.jahr}.
          Rot markierte Zeilen sind nicht qualifiziert und erhalten keine Auszahlung.
        </p>
      </div>

      {/* Warnung: Aktive Projekte */}
      {aktiveProjekte.length > 0 && (
        <button
          onClick={onZeigeProjekte}
          className="w-full text-left bg-grenz-50 border border-grenz-200 hover:border-grenz-400 hover:bg-grenz-100 rounded-xl p-4 flex gap-3 transition-colors cursor-pointer group"
        >
          <svg className="w-5 h-5 text-grenz-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-grenz-700">
              {aktiveProjekte.length} aktive Projekte noch offen
            </p>
            <p className="text-xs text-grenz-600 mt-0.5">
              Projektsalden können sich noch ändern. Jahresabschluss erst nach Projektabschluss empfohlen.
            </p>
          </div>
          <svg className="w-4 h-4 text-grenz-400 flex-shrink-0 mt-0.5 group-hover:text-grenz-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* KPI-Zeile */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { l: 'Gesamttopf',       v: eur(gesamtTopf), c: 'text-bonus-700 text-xl' },
          { l: 'Qualifiziert',     v: `${qualifiziert.length} / ${vorschau.ergebnis.length}`, c: 'text-gray-900 text-xl' },
          { l: 'Option A gesamt',  v: eur(topfA),      c: 'text-info-700 text-lg' },
          { l: 'Option B gesamt',  v: eur(topfB),      c: 'text-info-700 text-lg' },
        ].map(({ l, v, c }) => (
          <div key={l} className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide">{l}</p>
            <p className={`font-bold mt-1 ${c}`}>{v}</p>
          </div>
        ))}
      </div>

      {/* Tabelle */}
      <div className="overflow-x-auto border border-gray-100 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide bg-gray-50">
              <th className="py-3 pl-4 pr-3">Mitarbeiter</th>
              <th className="py-3 pr-3 text-center">Status</th>
              <th className="py-3 pr-3 text-right">Option A</th>
              <th className="py-3 pr-3 text-right">Option B</th>
              <th className="py-3 pr-4 text-right font-semibold">Gesamt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sortiert.map((e) => (
              <tr
                key={e.mitarbeiterId}
                className={`transition-colors ${
                  e.qualifiziert ? 'hover:bg-gray-50' : 'bg-malus-50 hover:bg-malus-100'
                }`}
              >
                <td className="py-2.5 pl-4 pr-3">
                  <p className={`font-medium ${e.qualifiziert ? 'text-gray-800' : 'text-malus-700'}`}>
                    {e.mitarbeiterName}
                  </p>
                  {!e.qualifiziert && e.disqualGrund && (
                    <p className="text-xs text-malus-500 mt-0.5">{e.disqualGrund}</p>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-center">
                  <Badge variant={e.qualifiziert ? 'bonus' : 'malus'} dot>
                    {e.qualifiziert ? 'qualifiziert' : 'nicht qual.'}
                  </Badge>
                </td>
                <td className="py-2.5 pr-3 text-right text-gray-600">
                  {eur(e.optionA_betrag)}
                </td>
                <td className="py-2.5 pr-3 text-right text-gray-600">
                  {eur(e.optionB_betrag)}
                </td>
                <td className={`py-2.5 pr-4 text-right font-semibold ${e.qualifiziert ? 'text-bonus-700' : 'text-malus-500 line-through'}`}>
                  {eur(e.gesamtBetrag)}
                </td>
              </tr>
            ))}
          </tbody>
          {/* Summenzeile */}
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50">
              <td className="py-3 pl-4 pr-3 font-semibold text-gray-700">
                Gesamt ({qualifiziert.length} Mitarbeiter)
              </td>
              <td colSpan={2} />
              <td className="py-3 pr-3 text-right font-semibold text-gray-700">{eur(topfB)}</td>
              <td className="py-3 pr-4 text-right font-bold text-bonus-700 text-base">{eur(gesamtTopf)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {nichtQualif.length > 0 && (
        <p className="text-xs text-gray-400">
          ℹ {nichtQualif.length} nicht qualifizierte Mitarbeiter erhalten keine Auszahlung
          und sind in der Gesamtsumme nicht enthalten.
        </p>
      )}

      <div className="flex justify-end">
        <Button variant="primary" onClick={onWeiter}>
          Weiter zur Überprüfung →
        </Button>
      </div>
    </div>
  );
}

// ─── Schritt 2: Überprüfung ───────────────────────────────────────────────────

function Schritt2Ueberpruefung({
  vorschau,
  aktiveProjekte,
  kommentare,
  onKommentarAendern,
  onWeiter,
  onZurueck,
  onZeigeProjekte,
}: {
  vorschau:            VorschauAntwort;
  aktiveProjekte:      Projekt[];
  kommentare:          Record<number, string>;
  onKommentarAendern:  (id: number, text: string) => void;
  onWeiter:            () => void;
  onZurueck:           () => void;
  onZeigeProjekte:     () => void;
}) {
  const [bestaetigt, setBestaetigt] = useState(false);

  const qualifiziert = vorschau.ergebnis.filter((e) => e.qualifiziert);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Schritt 2 — Überprüfung</h2>
        <p className="text-sm text-gray-500 mt-1">
          Überprüfe die Beträge und hinterlasse optional Kommentare je Mitarbeiter.
        </p>
      </div>

      {/* Warnung: Aktive Projekte */}
      {aktiveProjekte.length > 0 && (
        <button
          onClick={onZeigeProjekte}
          className="w-full text-left bg-grenz-50 border border-grenz-200 hover:border-grenz-400 hover:bg-grenz-100 rounded-xl p-4 flex gap-3 transition-colors cursor-pointer group"
        >
          <svg className="w-5 h-5 text-grenz-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-grenz-700">
              Achtung: {aktiveProjekte.length} aktive Projekte sind noch nicht abgeschlossen
            </p>
            <p className="text-xs text-grenz-600 mt-0.5">
              Nach der Freigabe sind die Beträge festgeschrieben. Spätere Projektabschlüsse
              ändern die genehmigten Auszahlungen nicht mehr.
            </p>
          </div>
          <svg className="w-4 h-4 text-grenz-400 flex-shrink-0 mt-0.5 group-hover:text-grenz-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Kommentar-Bereich je Mitarbeiter */}
      <Card>
        <CardHeader>
          <CardTitle>Kommentare je Mitarbeiter</CardTitle>
        </CardHeader>
        <div className="space-y-4">
          {vorschau.ergebnis
            .sort((a, b) => b.gesamtBetrag - a.gesamtBetrag)
            .map((e) => (
              <div key={e.mitarbeiterId} className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className={`text-sm font-medium ${e.qualifiziert ? 'text-gray-800' : 'text-malus-600'}`}>
                      {e.mitarbeiterName}
                    </p>
                    <Badge variant={e.qualifiziert ? 'bonus' : 'malus'}>
                      {eur(e.gesamtBetrag)}
                    </Badge>
                    {!e.qualifiziert && (
                      <Badge variant="malus">nicht qualifiziert</Badge>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Kommentar (optional)…"
                    value={kommentare[e.mitarbeiterId] ?? ''}
                    onChange={(ev) => onKommentarAendern(e.mitarbeiterId, ev.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500"
                  />
                </div>
              </div>
            ))}
        </div>
      </Card>

      {/* Bestätigungs-Checkbox */}
      <div
        className={`border-2 rounded-xl p-4 transition-colors ${
          bestaetigt ? 'border-bonus-400 bg-bonus-50' : 'border-gray-200 bg-gray-50'
        }`}
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={bestaetigt}
            onChange={(e) => setBestaetigt(e.target.checked)}
            className="mt-0.5 w-5 h-5 rounded border-gray-300 text-bonus-600 focus:ring-bonus-500 cursor-pointer"
          />
          <div>
            <p className="text-sm font-semibold text-gray-800">
              Ich habe alle Beträge geprüft und bestätige die Richtigkeit
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Ich bestätige, dass die berechneten Bonus-Ansprüche für alle {qualifiziert.length} qualifizierten
              Mitarbeiter korrekt sind und der Jahresabschluss {vorschau.jahr} freigegeben werden kann.
            </p>
          </div>
        </label>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onZurueck}>← Zurück</Button>
        <Button variant="primary" onClick={onWeiter} disabled={!bestaetigt}>
          Weiter zur Passwortbestätigung →
        </Button>
      </div>
    </div>
  );
}

// ─── Schritt 3: Passwort ─────────────────────────────────────────────────────

function Schritt3Passwort({
  vorschau,
  onFreigeben,
  onZurueck,
  freigeben,
}: {
  vorschau:    VorschauAntwort;
  onFreigeben: (passwort: string) => Promise<void>;
  onZurueck:   () => void;
  freigeben:   boolean;
}) {
  const [passwort,   setPasswort]   = useState('');
  const [sichtbar,   setSichtbar]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [fehler,     setFehler]     = useState<string | null>(null);

  const qualifiziert = vorschau.ergebnis.filter((e) => e.qualifiziert);
  const gesamtTopf   = qualifiziert.reduce((s, e) => s + e.gesamtBetrag, 0);

  const handleFreigeben = async () => {
    if (!passwort) return;
    setLoading(true);
    setFehler(null);
    try {
      await onFreigeben(passwort);
      setPasswort(''); // Passwort sofort löschen
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Fehler';
      // Axios-Fehler auslesen
      const axiosMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFehler(axiosMsg ?? msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Schritt 3 — Passwortbestätigung</h2>
        <p className="text-sm text-gray-500 mt-1">
          Diese Aktion ist <strong>irreversibel</strong>. Gib dein Admin-Passwort zur Bestätigung ein.
        </p>
      </div>

      {/* Was passiert bei Freigabe */}
      <div className="bg-info-50 border border-info-200 rounded-xl p-4 space-y-2">
        <p className="text-sm font-semibold text-info-800">Was passiert nach der Freigabe:</p>
        <ul className="text-sm text-info-700 space-y-1 pl-4 list-disc">
          <li>
            Für <strong>{qualifiziert.length} Mitarbeiter</strong> werden Auszahlungs-Datensätze angelegt
          </li>
          <li>
            Gesamtbetrag: <strong>{eur(gesamtTopf)}</strong>
          </li>
          <li>
            Alle Buchungen erhalten den Status <Badge variant="info">ausstehend</Badge>
          </li>
          <li>
            Im Audit-Trail werden unveränderliche Bonusbuchungen erstellt
          </li>
          <li className="font-medium text-malus-700">
            Diese Aktion kann <u>nicht</u> rückgängig gemacht werden
          </li>
        </ul>
      </div>

      {/* Passwort-Eingabe */}
      <div className="max-w-sm mx-auto space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          Dein Admin-Passwort
        </label>
        <div className="relative">
          <input
            type={sichtbar ? 'text' : 'password'}
            value={passwort}
            onChange={(e) => { setPasswort(e.target.value); setFehler(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && passwort) handleFreigeben(); }}
            placeholder="Passwort eingeben…"
            autoComplete="current-password"
            className={`w-full px-4 py-3 pr-12 border-2 rounded-xl text-sm focus:outline-none transition-colors ${
              fehler ? 'border-malus-400 bg-malus-50' : 'border-gray-200 focus:border-info-500'
            }`}
          />
          <button
            type="button"
            onClick={() => setSichtbar(!sichtbar)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {sichtbar ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0 1 12 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 0 1 1.563-3.029m5.858.908a3 3 0 1 1 4.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88 6.59 6.59m7.532 7.532 3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0 1 12 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 0 1-4.132 5.411m0 0L21 21"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                <circle cx={12} cy={12} r={3}/>
              </svg>
            )}
          </button>
        </div>
        {fehler && (
          <div className="flex items-center gap-2 text-malus-600 text-sm">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            </svg>
            {fehler}
          </div>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onZurueck} disabled={loading}>
          ← Zurück
        </Button>
        <Button
          variant="danger"
          onClick={handleFreigeben}
          loading={loading || freigeben}
          disabled={!passwort || loading || freigeben}
        >
          {loading || freigeben ? 'Wird verarbeitet…' : '🔓 Jahresabschluss unwiderruflich freigeben'}
        </Button>
      </div>
    </div>
  );
}

// ─── Schritt 4: Freigabe-Ergebnis ─────────────────────────────────────────────

function Schritt4Ergebnis({
  ergebnis,
  onWeiter,
}: {
  ergebnis: FreigebenAntwort;
  onWeiter: () => void;
}) {
  // Erfolgs-Animation beim Einblenden
  useEffect(() => {}, []);

  return (
    <div className="space-y-6 text-center py-4">
      {/* Erfolgs-Icon */}
      <div className="w-20 h-20 mx-auto rounded-full bg-bonus-100 flex items-center justify-center animate-scaleIn">
        <svg className="w-10 h-10 text-bonus-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
        </svg>
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-900">Jahresabschluss freigegeben</h2>
        <p className="text-sm text-gray-500 mt-2">
          Der Jahresabschluss {ergebnis.kalenderjahr} wurde erfolgreich verarbeitet.
        </p>
      </div>

      {/* Ergebnis-Karten */}
      <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
        <div className="bg-bonus-50 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Mitarbeiter</p>
          <p className="text-3xl font-bold text-bonus-700 mt-1">
            {ergebnis.verarbeiteteMitarbeiter}
          </p>
        </div>
        <div className="bg-bonus-50 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Gesamtbetrag</p>
          <p className="text-2xl font-bold text-bonus-700 mt-1">
            {eur(ergebnis.gesamtAuszahlungTopf)}
          </p>
        </div>
      </div>

      <div className="text-xs text-gray-400">
        Erstellt am {new Date(ergebnis.erstelltAm).toLocaleString('de-DE', { dateStyle: 'long', timeStyle: 'short' })}
      </div>

      {/* Audit-Hinweis */}
      <div className="bg-gray-50 rounded-xl p-4 text-left text-xs text-gray-500 space-y-1 max-w-md mx-auto">
        <p className="font-medium text-gray-700">Audit-Trail</p>
        <p>✓ Unveränderliche Bonusbuchungen erstellt (kein UPDATE/DELETE möglich)</p>
        <p>✓ Auszahlungs-Datensätze mit Status „ausstehend" angelegt</p>
        <p>✓ Freigabe-Zeitstempel protokolliert</p>
      </div>

      <Button variant="primary" onClick={onWeiter}>
        Weiter zum Export →
      </Button>
    </div>
  );
}

// ─── Schritt 5: Export & Jahresreset ─────────────────────────────────────────

function Schritt5Export({
  ergebnis,
  onAuszahlungen,
}: {
  ergebnis:      FreigebenAntwort;
  onAuszahlungen: () => void;
}) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [pdfOk,          setPdfOk]          = useState(false);
  const [csvOk,          setCsvOk]          = useState(false);
  const [downloadFehler, setDownloadFehler] = useState<string | null>(null);

  // Reset-Dialog
  const [resetModal,    setResetModal]    = useState(false);
  const [resetPasswort, setResetPasswort] = useState('');
  const [resetCheck,    setResetCheck]    = useState(false);
  const [resetLoading,  setResetLoading]  = useState(false); // eslint-disable-line
  const [resetFehler,   setResetFehler]   = useState<string | null>(null);
  const [resetErfolg,   setResetErfolg]   = useState(false);
  const [resetBestaetigung, setResetBestaetigung] = useState(false);

  const handleDownload = async (format: 'pdf' | 'csv') => {
    const setSaving = format === 'pdf' ? setDownloadingPdf : setDownloadingCsv;
    const setOk     = format === 'pdf' ? setPdfOk         : setCsvOk;
    setSaving(true);
    setDownloadFehler(null);
    try {
      await downloadExport(ergebnis.kalenderjahr, format);
      setOk(true);
      setTimeout(() => setOk(false), 3000);
    } catch {
      setDownloadFehler(`${format.toUpperCase()}-Export fehlgeschlagen. Bitte erneut versuchen.`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetBestaetigen = () => {
    setResetModal(false);
    setResetBestaetigung(true);
  };

  const handleResetDurchfuehren = async () => {
    setResetLoading(true);
    setResetFehler(null);
    try {
      await postReset(ergebnis.kalenderjahr, resetPasswort);
      setResetPasswort('');
      setResetCheck(false);
      setResetBestaetigung(false);
      setResetErfolg(true);
    } catch (err: unknown) {
      const axiosMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setResetFehler(axiosMsg ?? 'Reset fehlgeschlagen');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Schritt 5 — Export & Abschluss</h2>
        <p className="text-sm text-gray-500 mt-1">
          Lade die Berichte herunter und starte optional den Jahresreset für {ergebnis.kalenderjahr + 1}.
        </p>
      </div>

      {/* Export-Bereich */}
      <Card>
        <CardHeader>
          <CardTitle>Berichte herunterladen</CardTitle>
        </CardHeader>
        <div className="grid sm:grid-cols-2 gap-4">
          {/* PDF */}
          <div className="border border-gray-100 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-malus-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-malus-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">PDF-Bericht</p>
                <p className="text-xs text-gray-400">Deckblatt · Tabelle · Datum · Admin-Name</p>
              </div>
            </div>
            <Button
              variant={pdfOk ? 'success' : 'secondary'}
              size="sm"
              fullWidth
              onClick={() => handleDownload('pdf')}
              loading={downloadingPdf}
            >
              {pdfOk ? '✓ Heruntergeladen' : '⬇ PDF herunterladen'}
            </Button>
          </div>

          {/* CSV */}
          <div className="border border-gray-100 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-bonus-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-bonus-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">CSV Lohnbuchhaltung</p>
                <p className="text-xs text-gray-400">Mitarbeiter · IBAN (leer) · Betrag</p>
              </div>
            </div>
            <Button
              variant={csvOk ? 'success' : 'secondary'}
              size="sm"
              fullWidth
              onClick={() => handleDownload('csv')}
              loading={downloadingCsv}
            >
              {csvOk ? '✓ Heruntergeladen' : '⬇ CSV herunterladen'}
            </Button>
          </div>
        </div>
        {downloadFehler && (
          <p className="text-xs text-malus-600 mt-3">{downloadFehler}</p>
        )}
      </Card>

      {/* Auszahlungsprotokoll-Link */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">Auszahlungsprotokoll</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Alle {ergebnis.verarbeiteteMitarbeiter} Auszahlungen verwalten, genehmigen und markieren
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onAuszahlungen}>
            Zum Protokoll →
          </Button>
        </div>
      </Card>

      {/* Jahresreset */}
      <Card>
        <div className="bg-malus-50 border border-malus-200 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-malus-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            </svg>
            <div>
              <p className="text-sm font-semibold text-malus-800">Jahresreset</p>
              <p className="text-xs text-malus-600 mt-1">
                Setzt alle Kranktage auf 0 für den Start des neuen Jahres {ergebnis.kalenderjahr + 1}.
                Bonusbuchungen und Auszahlungs-Datensätze bleiben erhalten (Audit-Trail ist unveränderlich).
                Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
            </div>
          </div>

          {resetErfolg ? (
            <div className="flex items-center gap-2 text-bonus-700 bg-bonus-50 rounded-lg p-3">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
              </svg>
              <p className="text-sm font-medium">
                Jahresreset abgeschlossen. Alle Kranktage wurden auf 0 gesetzt.
              </p>
            </div>
          ) : (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setResetModal(true)}
            >
              Jahresreset durchführen
            </Button>
          )}
        </div>
      </Card>

      {/* Reset-Modal: Schritt 1 — Passwort + Checkbox */}
      {resetModal && (
        <Modal
          title="Jahresreset bestätigen"
          onClose={() => { setResetModal(false); setResetPasswort(''); setResetCheck(false); setResetFehler(null); }}
          size="sm"
        >
          <div className="space-y-4">
            <div className="bg-malus-50 rounded-xl p-3 text-xs text-malus-700">
              <p className="font-semibold mb-1">⚠ Irreversible Aktion</p>
              <p>Alle Kranktage werden auf 0 gesetzt. Das neue Jahr {ergebnis.kalenderjahr + 1} beginnt mit einem frischen Zähler.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Passwort zur Bestätigung</label>
              <input
                type="password"
                value={resetPasswort}
                onChange={(e) => { setResetPasswort(e.target.value); setResetFehler(null); }}
                placeholder="Admin-Passwort…"
                className={`w-full px-3 py-2 text-sm border-2 rounded-lg focus:outline-none ${
                  resetFehler ? 'border-malus-400' : 'border-gray-200 focus:border-malus-500'
                }`}
              />
              {resetFehler && <p className="text-xs text-malus-600 mt-1">{resetFehler}</p>}
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={resetCheck}
                onChange={(e) => setResetCheck(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-malus-600 focus:ring-malus-500"
              />
              <span className="text-xs text-gray-700">
                Ich verstehe, dass diese Aktion alle Kranktage auf 0 setzt und nicht rückgängig gemacht werden kann.
              </span>
            </label>

            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setResetModal(false); setResetPasswort(''); setResetCheck(false); }}
              >
                Abbrechen
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleResetBestaetigen}
                disabled={!resetPasswort || !resetCheck}
              >
                Weiter zur finalen Bestätigung
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reset-Modal: Schritt 2 — Finale Bestätigung */}
      {resetBestaetigung && (
        <ConfirmModal
          title="Letzte Bestätigung"
          message={`Jahresreset für ${ergebnis.kalenderjahr} wirklich durchführen? Diese Aktion setzt alle Kranktage auf 0 und kann nicht rückgängig gemacht werden.`}
          confirmLabel={resetLoading ? 'Wird verarbeitet…' : 'Ja, Jahresreset jetzt durchführen'}
          variant="danger"
          loading={resetLoading}
          onConfirm={handleResetDurchfuehren}
          onCancel={() => { setResetBestaetigung(false); setResetPasswort(''); }}
        />
      )}
    </div>
  );
}

// ─── Halbjahr-Karte ───────────────────────────────────────────────────────────

function HalbjahrKarte({ jahr }: { jahr: number }) {
  const [passwort,   setPasswort]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [ergebnis,   setErgebnis]   = useState<HalbjahrAntwort | null>(null);
  const [fehler,     setFehler]     = useState<string | null>(null);
  const [showForm,   setShowForm]   = useState(false);

  const handleAuszahlen = async () => {
    if (!passwort.trim()) return;
    setLoading(true);
    setFehler(null);
    try {
      const res = await postHalbjahr(jahr, passwort);
      setErgebnis(res);
      setPasswort('');
      setShowForm(false);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setFehler(msg ?? 'Fehler bei der H1-Auszahlung');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Halbjahres-Auszahlung {jahr} — Option A</CardTitle>
        <Badge variant="info">Optional</Badge>
      </CardHeader>
      <p className="text-xs text-gray-400 mb-4">
        Zahlt die aktuell berechneten Option-A-Beträge als H1-Vorschuss aus. Der Betrag wird beim
        Jahresabschluss automatisch vom Gesamtbetrag abgezogen.
      </p>

      {ergebnis ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-bonus-50 border border-bonus-200 px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-bonus-800">H1-Auszahlung erfolgreich verbucht</p>
            <p className="text-xs text-bonus-700">
              {ergebnis.verarbeiteteMitarbeiter} Mitarbeiter ·{' '}
              {ergebnis.gesamtH1Topf.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} gesamt
            </p>
            <p className="text-xs text-gray-400">{new Date(ergebnis.erstelltAm).toLocaleString('de-DE')}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setErgebnis(null)}>
            Erneut auslösen
          </Button>
        </div>
      ) : showForm ? (
        <div className="space-y-3">
          <p className="text-xs text-grenz-700 bg-grenz-50 rounded-lg px-3 py-2 border border-grenz-200">
            Bitte Passwort zur Bestätigung eingeben. Die H1-Buchungen werden sofort geschrieben.
          </p>
          <input
            type="password"
            placeholder="Admin-Passwort…"
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAuszahlen()}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500"
          />
          {fehler && <p className="text-xs text-malus-600">{fehler}</p>}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleAuszahlen} loading={loading} disabled={!passwort.trim()}>
              H1 jetzt auszahlen
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setShowForm(false); setFehler(null); setPasswort(''); }}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
          H1 Auszahlung auslösen
        </Button>
      )}
    </Card>
  );
}

// ─── Haupt-Wizard ─────────────────────────────────────────────────────────────

export default function AdminJahresabschluss() {
  const navigate = useNavigate();
  const [schritt,           setSchritt]           = useState(1);
  const [abgeschlossen,     setAbgeschlossen]     = useState<Set<number>>(new Set());
  const [vorschau,          setVorschau]          = useState<VorschauAntwort | null>(null);
  const [ergebnis,          setErgebnis]          = useState<FreigebenAntwort | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [fehler,            setFehler]            = useState<string | null>(null);
  const [freigeben,         setFreigeben]         = useState(false);
  const [aktiveProjekte,    setAktiveProjekte]    = useState<Projekt[]>([]);
  const [projektModalOffen, setProjektModalOffen] = useState(false);
  const [kommentare,        setKommentare]        = useState<Record<number, string>>({});
  const [h1Aktiv,           setH1Aktiv]           = useState(false);

  const jahr = new Date().getFullYear();

  const laden = useCallback(async () => {
    setLoading(true);
    setFehler(null);
    try {
      const [v, p, k] = await Promise.all([
        getVorschau(jahr),
        getProjekteListe(),
        getKonfiguration(),
      ]);
      setVorschau(v);
      setAktiveProjekte(p.filter((pr) => pr.status === 'aktiv' && !pr.bonusAusgeschlossen));
      setH1Aktiv(k.halbjahresauszahlung_aktiv === 'true');
    } catch {
      setFehler('Vorschau konnte nicht geladen werden. Bitte Backend prüfen.');
    } finally {
      setLoading(false);
    }
  }, [jahr]);

  useEffect(() => { laden(); }, [laden]);

  const weiterZu = (nr: number) => {
    setAbgeschlossen((prev) => new Set(prev).add(schritt));
    setSchritt(nr);
  };

  const handleFreigeben = async (passwort: string) => {
    setFreigeben(true);
    try {
      const result = await postFreigeben(jahr, passwort);
      setErgebnis(result);
      weiterZu(4);
    } finally {
      setFreigeben(false);
    }
  };

  // Ladezustand
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 animate-fadeIn">
        <SkeletonCard />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonCard className="h-64" />
      </div>
    );
  }

  // Fehler
  if (fehler || !vorschau) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card>
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-malus-50 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-malus-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              </svg>
            </div>
            <p className="text-malus-600 font-medium">{fehler}</p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={laden}>
              Erneut versuchen
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-fadeIn space-y-6">
      {/* Halbjahres-Auszahlung (nur wenn in Konfiguration aktiviert) */}
      {h1Aktiv && <HalbjahrKarte jahr={jahr} />}

      <Card>
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-xl font-bold text-gray-900">Jahresabschluss {jahr}</h1>
            <Badge variant="grenz">Superadmin erforderlich</Badge>
          </div>
          <p className="text-xs text-gray-400">
            Sensibelster Bereich — alle Aktionen werden im Audit-Trail protokolliert
          </p>
        </div>

        <SchrittIndikator aktiv={schritt} abgeschlossen={abgeschlossen} />

        {/* Schritt-Inhalte */}
        {schritt === 1 && (
          <Schritt1Vorschau
            vorschau={vorschau}
            aktiveProjekte={aktiveProjekte}
            onWeiter={() => weiterZu(2)}
            onZeigeProjekte={() => setProjektModalOffen(true)}
          />
        )}

        {schritt === 2 && (
          <Schritt2Ueberpruefung
            vorschau={vorschau}
            aktiveProjekte={aktiveProjekte}
            kommentare={kommentare}
            onKommentarAendern={(id, text) =>
              setKommentare((prev) => ({ ...prev, [id]: text }))
            }
            onWeiter={() => weiterZu(3)}
            onZurueck={() => setSchritt(1)}
            onZeigeProjekte={() => setProjektModalOffen(true)}
          />
        )}

        {schritt === 3 && (
          <Schritt3Passwort
            vorschau={vorschau}
            onFreigeben={handleFreigeben}
            onZurueck={() => setSchritt(2)}
            freigeben={freigeben}
          />
        )}

        {schritt === 4 && ergebnis && (
          <Schritt4Ergebnis
            ergebnis={ergebnis}
            onWeiter={() => weiterZu(5)}
          />
        )}

        {schritt === 5 && ergebnis && (
          <Schritt5Export
            ergebnis={ergebnis}
            onAuszahlungen={() => navigate('/admin/auszahlungen')}
          />
        )}
      </Card>

      {/* Modal: Aktive Projekte */}
      <Modal
        open={projektModalOffen}
        onClose={() => setProjektModalOffen(false)}
        title={`Aktive Projekte (${aktiveProjekte.length})`}
        size="lg"
      >
        <p className="text-sm text-gray-500 mb-4">
          Diese Projekte sind noch nicht abgeschlossen. Ihre Salden können sich bis zum Jahresabschluss noch ändern.
        </p>
        <div className="divide-y divide-gray-100">
          {aktiveProjekte.map((p) => {
            const fortschritt = p.sollStunden > 0
              ? Math.min(100, Math.round((p.istStundenGesamt / p.sollStunden) * 100))
              : 0;
            return (
              <div key={p.id} className="py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.projektname}</p>
                  <p className="text-xs text-gray-400">{p.projektnummer}{p.abrechnungsJahr ? ` · ${p.abrechnungsJahr}` : ''}</p>
                </div>
                <div className="text-right shrink-0 w-28">
                  <p className="text-xs text-gray-500">
                    {Number(p.istStundenGesamt).toFixed(0)} / {Number(p.sollStunden).toFixed(0)} Std.
                  </p>
                  <div className="mt-1 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${fortschritt >= 90 ? 'bg-malus-500' : fortschritt >= 70 ? 'bg-grenz-400' : 'bg-bonus-500'}`}
                      style={{ width: `${fortschritt}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{fortschritt} %</p>
                </div>
              </div>
            );
          })}
        </div>
        {aktiveProjekte.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Keine aktiven Projekte.</p>
        )}
      </Modal>
    </div>
  );
}
