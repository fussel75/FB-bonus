/**
 * Admin — Bonus-Übersicht
 *
 * Zeigt für ein gewähltes Kalenderjahr:
 *   - KPI-Topf (Gesamt, Option A, Option B, Qualifizierte)
 *   - Pro Mitarbeiter: Option-A-Stunden, Option-B-Saldo, Gesamtbetrag, Qualifikation
 *   - Formular: Manuelle Extra-Stunden (Option A) buchen
 */

import { useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { YearPicker } from '@/components/ui/YearPicker';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { useFetch } from '@/hooks/useFetch';
import { getBonusUebersicht, getBonusBuchungen, postOptionABuchung } from '@/api/admin';
import { fmtEur } from '@/lib/fmt';
import { StdAnzeige, autoPrefix } from '@/components/ui/StdAnzeige';
import type { BonusJahresübersicht, BonusBuchung } from '@/types';

const AKTUELLES_JAHR = new Date().getFullYear();

// ─── KPI-Karte ────────────────────────────────────────────────────────────────

function KpiKarte({
  label,
  value,
  sub,
  color = 'neutral',
  onClick,
}: {
  label:    string;
  value:    React.ReactNode;
  sub?:     string;
  color?:   'bonus' | 'malus' | 'info' | 'neutral';
  onClick?: () => void;
}) {
  const colors = {
    bonus:   'bg-bonus-50  border-bonus-100',
    malus:   'bg-malus-50  border-malus-100',
    info:    'bg-info-50   border-info-100',
    neutral: 'bg-gray-50   border-gray-100',
  };
  const base = `rounded-2xl border p-4 ${colors[color]}`;

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${base} text-left w-full hover:brightness-95 hover:shadow-md transition-all cursor-pointer`}
      >
        <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
        <div className="text-2xl font-bold text-gray-900 tabular-nums">{value}</div>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub} &rsaquo;</p>}
      </button>
    );
  }

  return (
    <div className={base}>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <div className="text-2xl font-bold text-gray-900 tabular-nums">{value}</div>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Option-A-Buchungsformular (pro Mitarbeiter, aufklappbar) ─────────────────

function OptionAFormular({
  mitarbeiterId,
  onBuchen,
}: {
  mitarbeiterId: number;
  onBuchen:      () => void;
}) {
  const heute  = new Date().toISOString().slice(0, 10);
  const [stunden,  setStunden]  = useState('');
  const [datum,    setDatum]    = useState(heute);
  const [beschr,   setBeschr]   = useState('');
  const [saving,   setSaving]   = useState(false);
  const [fehler,   setFehler]   = useState<string | null>(null);
  const [ok,       setOk]       = useState(false);

  const handleSubmit = async () => {
    const h = parseFloat(stunden.replace(',', '.'));
    if (isNaN(h) || h <= 0) { setFehler('Stunden müssen positiv sein'); return; }
    if (!datum) { setFehler('Datum erforderlich'); return; }
    setSaving(true);
    setFehler(null);
    try {
      await postOptionABuchung({
        mitarbeiterId,
        stunden:       h,
        buchungsdatum: datum,
        beschreibung:  beschr.trim() || undefined,
      });
      setStunden('');
      setBeschr('');
      setOk(true);
      setTimeout(() => { setOk(false); onBuchen(); }, 1500);
    } catch (e: unknown) {
      setFehler((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Fehler beim Buchen');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-info-400 bg-white';

  return (
    <div className="mt-3 border border-dashed border-info-300 rounded-xl p-3 bg-info-50 space-y-2">
      <p className="text-xs font-semibold text-info-700 mb-1">Extra-Stunden buchen (Option A)</p>
      {fehler && <p className="text-xs text-malus-700 bg-malus-50 border border-malus-200 rounded-lg px-2 py-1">{fehler}</p>}
      {ok     && <p className="text-xs text-bonus-700 bg-bonus-50 border border-bonus-200 rounded-lg px-2 py-1">✓ Buchung gespeichert</p>}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">Stunden</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="z.B. 8"
            value={stunden}
            onChange={(e) => setStunden(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-0.5 block">Datum</label>
          <input
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-0.5 block">Beschreibung <span className="text-gray-300">(optional)</span></label>
        <input
          type="text"
          placeholder="z.B. Bereitschaftsdienst KW 12"
          value={beschr}
          onChange={(e) => setBeschr(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          className={inputCls}
        />
      </div>
      <Button variant="primary" size="xs" onClick={handleSubmit} loading={saving} disabled={!stunden || !datum}>
        Buchen
      </Button>
    </div>
  );
}

// ─── Mitarbeiter-Zeile ────────────────────────────────────────────────────────

function MitarbeiterZeile({
  ma,
  jahr,
  onRefresh,
}: {
  ma:        BonusJahresübersicht;
  jahr:      number;
  onRefresh: () => void;
}) {
  const [offen,        setOffen]        = useState(false);
  const [showForm,     setShowForm]     = useState(false);
  const [extraModal,   setExtraModal]   = useState(false);
  const [buchungen,    setBuchungen]    = useState<BonusBuchung[] | null>(null);
  const [buchLaden,    setBuchLaden]    = useState(false);
  const [buchFehler,   setBuchFehler]   = useState<string | null>(null);

  const oeffneExtraModal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setExtraModal(true);
    if (buchungen !== null) return;
    setBuchLaden(true);
    setBuchFehler(null);
    try {
      const hist = await getBonusBuchungen(ma.mitarbeiterId, jahr);
      setBuchungen(hist.buchungen);
    } catch {
      setBuchFehler('Buchungen konnten nicht geladen werden.');
    } finally {
      setBuchLaden(false);
    }
  };

  return (
    <>
      <div className={`border rounded-2xl overflow-hidden transition-colors ${
        !ma.qualifiziert ? 'border-gray-100 bg-gray-50/50' :
        ma.gesamtBetrag > 0 ? 'border-bonus-100 bg-white' :
        'border-gray-100 bg-white'
      }`}>

        {/* ── Zusammenfassung-Zeile (immer sichtbar) ── */}
        <button
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/80 active:bg-gray-100/60 transition-colors"
          onClick={() => setOffen(!offen)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900 truncate">{ma.mitarbeiterName}</span>
              {ma.qualifiziert ? (
                <Badge variant="bonus">✓ Qualifiziert</Badge>
              ) : (
                <Badge variant="neutral">Nicht qualifiziert</Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-gray-400">Option A</p>
              <p className="text-sm font-medium text-gray-700 tabular-nums"><StdAnzeige h={ma.optionA_stunden} /></p>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-xs text-gray-400">Option B</p>
              <p className={`text-sm font-medium tabular-nums ${ma.optionB_jahressaldo >= 0 ? 'text-bonus-600' : 'text-malus-500'}`}>
                <StdAnzeige h={ma.optionB_jahressaldo} prefix={autoPrefix(ma.optionB_jahressaldo)} />
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Gesamt</p>
              <p className={`text-base font-bold tabular-nums ${ma.gesamtBetrag > 0 ? 'text-bonus-700' : 'text-gray-400'}`}>
                {fmtEur(ma.gesamtBetrag)}
              </p>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${offen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </div>
        </button>

        {/* ── Aufgeklappter Detailbereich ── */}
        {offen && (
          <div className="px-4 pb-4 border-t border-gray-100">

            {!ma.qualifiziert && ma.disqualGrund && (
              <div className="mt-3 text-xs text-malus-700 bg-malus-50 border border-malus-100 rounded-xl px-3 py-2">
                <span className="font-semibold">Ausschlussgrund:</span> {ma.disqualGrund}
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-3">
              {/* Option A — klickbar */}
              <button
                onClick={oeffneExtraModal}
                className="text-left bg-info-50 rounded-xl p-3 border border-info-100 hover:bg-info-100 hover:shadow-sm transition-all cursor-pointer"
              >
                <p className="text-xs font-semibold text-info-600 mb-2">
                  Option A — Extra-Stunden
                </p>
                <p className="text-lg font-bold text-gray-900 tabular-nums">
                  <StdAnzeige h={ma.optionA_stunden} />
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {fmtEur(ma.optionA_betrag)} &rsaquo;
                </p>
              </button>

              {/* Option B */}
              <div className={`rounded-xl p-3 border ${ma.optionB_jahressaldo >= 0 ? 'bg-bonus-50 border-bonus-100' : 'bg-malus-50 border-malus-100'}`}>
                <p className={`text-xs font-semibold mb-2 ${ma.optionB_jahressaldo >= 0 ? 'text-bonus-700' : 'text-malus-700'}`}>
                  Option B — Projekteffizienz
                </p>
                <p className={`text-lg font-bold tabular-nums ${ma.optionB_jahressaldo >= 0 ? 'text-bonus-700' : 'text-malus-600'}`}>
                  <StdAnzeige h={ma.optionB_jahressaldo} prefix={autoPrefix(ma.optionB_jahressaldo)} />
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{fmtEur(ma.optionB_betrag)}</p>
              </div>
            </div>

            {/* Projekte */}
            {ma.projekte.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Projekte</p>
                <div className="space-y-1">
                  {ma.projekte.map((p) => (
                    <div key={p.projektId} className="flex items-center gap-2 py-1.5 px-2 rounded-xl hover:bg-gray-50">
                      <span className="text-xs text-gray-700 flex-1 truncate">{p.projektname}</span>
                      <span className={`text-xs font-medium tabular-nums ${p.guthabenStunden >= 0 ? 'text-bonus-600' : 'text-malus-500'}`}>
                        <StdAnzeige h={p.guthabenStunden} prefix={autoPrefix(p.guthabenStunden)} />
                      </span>
                      <span className="text-xs text-gray-400 tabular-nums w-16 text-right">{p.anteilProzent.toLocaleString('de-DE', { maximumFractionDigits: 0 })} %</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Extra-Stunden buchen */}
            <div className="mt-3 flex items-center justify-between">
              <button
                className="text-xs text-info-600 hover:text-info-700 font-medium underline underline-offset-2"
                onClick={() => setShowForm(!showForm)}
              >
                {showForm ? 'Formular schließen' : '+ Extra-Stunden buchen (Option A)'}
              </button>
            </div>
            {showForm && (
              <OptionAFormular
                mitarbeiterId={ma.mitarbeiterId}
                onBuchen={() => { setShowForm(false); onRefresh(); }}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Extra-Stunden-Detail-Modal ── */}
      {extraModal && (() => {
        const projektExtra = ma.projekte.filter((p) => (p.extraStunden ?? 0) > 0);
        const manuelleAnz  = buchungen?.length ?? 0;
        const hatDaten     = projektExtra.length > 0 || manuelleAnz > 0;
        return (
          <Modal
            onClose={() => setExtraModal(false)}
            title={`Extra-Stunden — ${ma.mitarbeiterName}`}
            size="lg"
          >
            {/* Projekt-Extra-Stunden (aus Projektzuordnung) */}
            {projektExtra.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Aus Projekten</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100">
                        <th className="py-2 pr-3">Projekt</th>
                        <th className="py-2 text-right">Extra-Stunden</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {projektExtra.map((p) => (
                        <tr key={p.projektId} className="hover:bg-gray-50">
                          <td className="py-2 pr-3 text-gray-700 text-xs">{p.projektname}</td>
                          <td className="py-2 text-right font-medium text-info-600 tabular-nums">
                            <StdAnzeige h={p.extraStunden!} prefix="+" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Manuelle Buchungen */}
            {buchLaden ? (
              <div className="space-y-2 py-2">
                {[1, 2].map((i) => <SkeletonCard key={i} className="h-10" />)}
              </div>
            ) : buchFehler ? (
              <p className="text-sm text-malus-600 py-4 text-center">{buchFehler}</p>
            ) : buchungen && buchungen.length > 0 ? (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Manuelle Buchungen</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100">
                        <th className="py-2 pr-3">Datum</th>
                        <th className="py-2 pr-3">Projekt</th>
                        <th className="py-2 pr-3">Beschreibung</th>
                        <th className="py-2 pr-3 text-right">Stunden</th>
                        <th className="py-2 text-right">Betrag</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {buchungen.map((b) => (
                        <tr key={b.id} className="hover:bg-gray-50">
                          <td className="py-2 pr-3 text-gray-500 text-xs whitespace-nowrap">
                            {new Date(b.buchungsdatum).toLocaleDateString('de-DE')}
                          </td>
                          <td className="py-2 pr-3 text-gray-700 text-xs">
                            {b.projekt
                              ? <span>{b.projekt.projektnummer}<br /><span className="text-gray-400">{b.projekt.projektname}</span></span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="py-2 pr-3 text-gray-500 text-xs">{b.beschreibung ?? '—'}</td>
                          <td className="py-2 pr-3 text-right font-medium text-info-600 tabular-nums">
                            <StdAnzeige h={Number(b.stunden)} prefix="+" />
                          </td>
                          <td className="py-2 text-right text-gray-700 tabular-nums text-xs">
                            {fmtEur(Number(b.betragEur))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* Leer-Zustand */}
            {!buchLaden && !hatDaten && (
              <p className="text-sm text-gray-400 text-center py-6">Keine Extra-Stunden für {jahr} erfasst.</p>
            )}

            {/* Gesamt-Zeile */}
            {hatDaten && (
              <div className="flex items-center justify-between pt-3 border-t border-gray-200 mt-1">
                <span className="text-sm font-semibold text-gray-700">Gesamt Option A</span>
                <div className="text-right">
                  <span className="text-base font-bold text-info-600 tabular-nums">
                    <StdAnzeige h={ma.optionA_stunden} prefix="+" />
                  </span>
                  <span className="text-xs text-gray-400 ml-2">{fmtEur(ma.optionA_betrag)}</span>
                </div>
              </div>
            )}
          </Modal>
        );
      })()}
    </>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function AdminBonusUebersicht() {
  const [jahr,          setJahr]         = useState(AKTUELLES_JAHR);
  const [version,       setVersion]      = useState(0);
  const [topExtraModal, setTopExtraModal] = useState(false);

  const laden = useCallback(
    () => getBonusUebersicht(jahr),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jahr, version],
  );

  const { data, loading, error, refresh: _r } = useFetch(laden, [jahr, version]);

  const refresh = () => setVersion((v) => v + 1);

  const sortiert = (data?.mitarbeiter ?? [])
    .slice()
    .sort((a, b) => b.gesamtBetrag - a.gesamtBetrag);

  // Mitarbeiter mit Option-A-Stunden für das Top-Modal
  const mitExtraStunden = sortiert.filter((ma) => ma.optionA_stunden > 0);

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Bonus-Übersicht</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Live-Berechnung · Daten werden bei Abruf neu berechnet
          </p>
        </div>
        <YearPicker value={jahr} onChange={setJahr} />
      </div>

      {/* ── Ladefehler ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="text-sm text-malus-700 bg-malus-50 border border-malus-200 rounded-2xl px-4 py-3">
          Fehler beim Laden: {error}
        </div>
      )}

      {/* ── KPI-Karten ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} className="h-20" />)}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 gap-3">
          <KpiKarte
            label="Bonus-Topf gesamt"
            value={<AnimatedCounter value={data.gesamtTopf} />}
            sub={`${data.anzahlQualifiziert} von ${data.anzahlMitarbeiter} MA qualifiziert`}
            color="bonus"
          />
          <KpiKarte
            label="Option A — Extra-Stunden"
            value={<AnimatedCounter value={data.topfOptionA} />}
            sub={`${mitExtraStunden.length} Mitarbeiter mit Zusatzstunden`}
            color="info"
            onClick={() => setTopExtraModal(true)}
          />
          <KpiKarte
            label="Option B — Projekteffizienz"
            value={<AnimatedCounter value={data.topfOptionB} />}
            sub="Aus positivem Jahressaldo"
            color="neutral"
          />
          <KpiKarte
            label="Nicht qualifiziert"
            value={data.anzahlNichtQualifiziert}
            sub="Wegen Kranktagen o.Ä. ausgeschlossen"
            color={data.anzahlNichtQualifiziert > 0 ? 'malus' : 'neutral'}
          />
        </div>
      ) : null}

      {/* ── Mitarbeiter-Liste ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Mitarbeiter ({sortiert.length})</CardTitle>
          <Button variant="secondary" size="xs" onClick={refresh} loading={loading}>
            Neu berechnen
          </Button>
        </CardHeader>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : sortiert.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Keine Daten für {jahr}</p>
        ) : (
          <div className="space-y-2">
            {sortiert.map((ma) => (
              <MitarbeiterZeile key={ma.mitarbeiterId} ma={ma} jahr={jahr} onRefresh={refresh} />
            ))}
          </div>
        )}
      </Card>

      {/* ── Top-KPI Extra-Stunden Modal ─────────────────────────────────────── */}
      {topExtraModal && data && (
        <Modal
          onClose={() => setTopExtraModal(false)}
          title="Option A — Extra-Stunden (alle Mitarbeiter)"
          size="lg"
        >
          {mitExtraStunden.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              Keine Extra-Stunden für {jahr} gebucht.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="py-2 pr-4">Mitarbeiter</th>
                    <th className="py-2 pr-4 text-right">Stunden</th>
                    <th className="py-2 text-right">Betrag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {mitExtraStunden.map((ma) => (
                    <tr key={ma.mitarbeiterId} className="hover:bg-gray-50">
                      <td className="py-2 pr-4 font-medium text-gray-800">
                        {ma.mitarbeiterName}
                        {ma.qualifiziert
                          ? <span className="ml-2 text-xs text-bonus-600">✓ Qualifiziert</span>
                          : <span className="ml-2 text-xs text-gray-400">Nicht qualifiziert</span>}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-info-600 font-semibold">
                        <StdAnzeige h={ma.optionA_stunden} prefix="+" />
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-700">
                        {fmtEur(ma.optionA_betrag)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 font-semibold">
                    <td className="py-2 pr-4 text-gray-700">Gesamt</td>
                    <td className="py-2 pr-4 text-right text-info-600" />
                    <td className="py-2 text-right text-gray-700">{fmtEur(data.topfOptionA)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Modal>
      )}

    </div>
  );
}
