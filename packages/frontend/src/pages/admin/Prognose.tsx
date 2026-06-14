/**
 * Admin — Prognose-Modul (Schritt 10 überarbeitet)
 *
 * Tab 1 — Mitarbeiter-Prognose:
 *   SVG-Linienchart (kein externes Framework), Min/Max-Band, sortierbare Tabelle
 *
 * Tab 2 — Projekt-Sensitivität (NEU):
 *   Backend liefert alle Berechnungen — Frontend zeigt nur an.
 *   Stunden-Puffer je Projekt + Mitarbeiter-Anteil. Kritische Projekte oben.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Card }                               from '@/components/ui/Card';
import { Badge }                             from '@/components/ui/Badge';
import { Button }                            from '@/components/ui/Button';
import { ProgressBar }                       from '@/components/ui/ProgressBar';
import { SkeletonCard }                      from '@/components/ui/Skeleton';
import { YearPicker }                        from '@/components/ui/YearPicker';
import { getPrognose, getProjektSensitivitaet, postSimulation, type PrognoseAntwort } from '@/api/admin';
import { toHHMM } from '@/lib/fmt';
import { StdAnzeige, autoPrefix } from '@/components/ui/StdAnzeige';
import type { PrognoseErgebnis, ProjektSensitivitaet, ProjektSensitivitaetAntwort, SimulationsErgebnis } from '@/types';

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function eur(n: number) {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

// ─── Tab-Indikator ────────────────────────────────────────────────────────────

function Tabs({ aktiv, onChange }: { aktiv: string; onChange: (t: string) => void }) {
  const tabs = [
    { id: 'mitarbeiter', label: 'Mitarbeiter-Prognose' },
    { id: 'projekte',    label: 'Projekt-Sensitivität' },
    { id: 'simulation',  label: 'Prognosesimulation' },
  ];
  return (
    <div className="flex gap-1 border-b border-gray-100 mb-5">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            aktiv === t.id
              ? 'border-info-600 text-info-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── SVG-Linienchart ─────────────────────────────────────────────────────────

function LineChart({ data, fortschritt }: { data: PrognoseErgebnis[]; fortschritt: number }) {
  const W   = 560;
  const H   = 240;
  const PAD = { top: 24, right: 24, bottom: 44, left: 68 };
  const IW  = W - PAD.left - PAD.right;
  const IH  = H - PAD.top  - PAD.bottom;

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        Keine Prognosedaten vorhanden
      </div>
    );
  }

  const jetzt = new Date().getMonth() + 1;
  const gesamtProg = data.reduce((s, d) => s + d.prognoseBetrag, 0);
  const gesamtMin  = data.reduce((s, d) => s + d.minSzenario,   0);
  const gesamtMax  = data.reduce((s, d) => s + d.maxSzenario,   0);
  const istJetzt   = gesamtMin;
  const yMax       = gesamtMax * 1.15;

  function xScale(m: number) { return PAD.left + ((m - 1) / 11) * IW; }
  function yScale(v: number) { return PAD.top  + IH - (v / yMax) * IH; }

  function toSVGPath(pts: [number, number][], close = false) {
    const d = pts.map(([m, v], i) =>
      `${i === 0 ? 'M' : 'L'} ${xScale(m).toFixed(1)} ${yScale(v).toFixed(1)}`,
    ).join(' ');
    return close ? d + ' Z' : d;
  }

  const progPunkte:  [number, number][] = [[1, 0], [jetzt, istJetzt], [12, gesamtProg]];
  const bandUnten:   [number, number][] = [[1, 0], [jetzt, gesamtMin * 0.88], [12, gesamtMin]];
  const bandOben:    [number, number][] = [[1, 0], [jetzt, gesamtMax * 0.97], [12, gesamtMax]];

  // Umschlag-Pfad für Min/Max-Band
  const bandPfad = [
    ...bandUnten,
    ...[...bandOben].reverse(),
  ];

  const yTicks  = [0, 0.25, 0.5, 0.75, 1.0].map((t) => yMax * t);
  const monate  = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

  return (
    <div className="overflow-x-auto -mx-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 300 }}>
        {/* Gitter */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={yScale(v)}
              x2={PAD.left + IW} y2={yScale(v)}
              stroke="#f3f4f6" strokeWidth={1}
            />
            <text x={PAD.left - 6} y={yScale(v) + 4} textAnchor="end" fontSize={9} fill="#9ca3af">
              {v > 999 ? `${(v / 1000).toFixed(0)}k` : Math.round(v)}€
            </text>
          </g>
        ))}

        {/* Min/Max-Band */}
        <path d={toSVGPath(bandPfad, true)} fill="#d1fae5" fillOpacity={0.5} />

        {/* Prognose-Linie */}
        <path
          d={toSVGPath(progPunkte)}
          fill="none" stroke="#059669" strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round"
        />

        {/* Heute-Linie */}
        <line
          x1={xScale(jetzt)} y1={PAD.top}
          x2={xScale(jetzt)} y2={PAD.top + IH}
          stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3"
        />
        <text x={xScale(jetzt)} y={PAD.top - 6} textAnchor="middle" fontSize={9} fill="#d97706" fontWeight="bold">
          Heute ({fortschritt}%)
        </text>

        {/* X-Achse */}
        {monate.map((m, i) => (
          <text
            key={m} x={xScale(i + 1)} y={H - 10}
            textAnchor="middle" fontSize={9}
            fill={i + 1 === jetzt ? '#d97706' : '#9ca3af'}
            fontWeight={i + 1 === jetzt ? 'bold' : 'normal'}
          >
            {m}
          </text>
        ))}

        {/* Punkte auf Linie */}
        {progPunkte.map(([m, v], i) => (
          <circle key={i} cx={xScale(m)} cy={yScale(v)} r={4}
            fill="white" stroke="#059669" strokeWidth={2} />
        ))}

        {/* Endwert-Label */}
        <text x={xScale(12) + 6} y={yScale(gesamtProg) + 4}
          fontSize={10} fill="#059669" fontWeight="bold">
          {gesamtProg > 999 ? `${(gesamtProg / 1000).toFixed(1)}k €` : `${Math.round(gesamtProg)} €`}
        </text>
      </svg>

      {/* Legende */}
      <div className="flex items-center gap-5 mt-2 text-xs text-gray-500 justify-center flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-0.5 bg-bonus-500 rounded" />
          <span>Prognose (linearer Trend)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-3 bg-bonus-100 rounded opacity-70" />
          <span>Min/Max-Band</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-0.5 h-3" style={{ borderLeft: '2px dashed #f59e0b' }} />
          <span>Aktueller Monat</span>
        </div>
      </div>
    </div>
  );
}

// ─── Mitarbeiter-Prognose-Karte ────────────────────────────────────────────────

function MitarbeiterKarte({ e }: { e: PrognoseErgebnis }) {
  const range     = e.maxSzenario - e.minSzenario;
  const posInRange = range > 0
    ? Math.min(100, Math.max(0, ((e.prognoseBetrag - e.minSzenario) / range) * 100))
    : 50;

  const pufferKrit = e.risikoStundenPuffer !== -1 && e.risikoStundenPuffer < 10;
  const pufferWarn = !pufferKrit && e.risikoStundenPuffer !== -1 && e.risikoStundenPuffer < 30;

  return (
    <div className="space-y-2 border-b border-gray-50 pb-4 last:border-0 last:pb-0">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-800">{e.mitarbeiterName}</p>
        <span className="text-sm font-bold text-bonus-700">{eur(e.prognoseBetrag)}</span>
      </div>

      {/* Min → Prognose → Max Schiene */}
      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-grenz-100 to-bonus-100 rounded-full" />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-bonus-500 rounded-full border-2 border-white shadow-sm z-10"
          style={{ left: `calc(${posInRange}% - 6px)` }}
        />
      </div>

      <div className="flex justify-between text-xs text-gray-400">
        <span>Min: {eur(e.minSzenario)}</span>
        <span>Max: {eur(e.maxSzenario)}</span>
      </div>

      {e.risikoStundenPuffer !== -1 && (
        <div className={`text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 ${
          pufferKrit ? 'bg-malus-50 text-malus-700' :
          pufferWarn ? 'bg-grenz-50 text-grenz-700' :
          'bg-gray-50 text-gray-500'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            pufferKrit ? 'bg-malus-500' :
            pufferWarn ? 'bg-grenz-500' :
            'bg-bonus-500'
          }`} />
          Stunden-Puffer: <strong className="ml-0.5"><StdAnzeige h={e.risikoStundenPuffer} /></strong>
          {pufferKrit && <span className="ml-1 font-semibold">— kritisch!</span>}
        </div>
      )}
    </div>
  );
}

// ─── Projekt-Sensitivitäts-Karte ─────────────────────────────────────────────

function ProjektSensKarte({ p }: { p: ProjektSensitivitaet }) {
  const [offen, setOffen] = useState(false);
  const ueber      = p.saldo < 0;
  // Abgeschlossene Projekte mit positivem Saldo sind kein Risiko mehr → kein "kritisch"
  const krit       = !ueber && !p.nochNichtBegonnen && p.saldo < 10 && !p.abgeschlossen;
  const ausstehend = p.nochNichtBegonnen;

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      ueber      ? 'border-malus-200 bg-malus-50' :
      krit       ? 'border-grenz-300 bg-grenz-50' :
      ausstehend ? 'border-gray-200 bg-gray-50' :
      'border-gray-100 bg-white'
    }`}>
      {/* Header-Zeile */}
      <button
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-black/[0.02] transition-colors"
        onClick={() => setOffen(!offen)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Saldo-Indikator */}
          <div className={`w-2 h-10 rounded-full flex-shrink-0 ${
            ueber      ? 'bg-malus-500' :
            krit       ? 'bg-grenz-500' :
            ausstehend ? 'bg-gray-300' :
            'bg-bonus-500'
          }`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{p.projektname}</p>
            <p className="text-xs text-gray-400">{p.projektnummer}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Auslastungs-Balken */}
          <div className="hidden sm:block w-28">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{p.auslastungProz}%</span>
              <span>{toHHMM(p.istStunden)}</span>
            </div>
            <ProgressBar value={p.auslastungProz} variant="auto" size="sm" />
          </div>

          {/* Saldo */}
          <div className="text-right">
            <p className={`text-sm font-bold ${
              ueber      ? 'text-malus-700' :
              krit       ? 'text-grenz-700' :
              ausstehend ? 'text-gray-400' :
              'text-bonus-600'
            }`}>
              <StdAnzeige h={p.saldo} prefix={autoPrefix(p.saldo)} />
            </p>
            <p className="text-xs text-gray-400">Saldo</p>
          </div>

          {/* Status-Badge */}
          <Badge variant={ueber ? 'malus' : krit ? 'grenz' : ausstehend ? 'neutral' : 'bonus'}>
            {ueber ? 'überzogen' : krit ? 'kritisch' : ausstehend ? 'ausstehend' : 'ok'}
          </Badge>

          {/* Chevron */}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${offen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </button>

      {/* Aufklapp: Mitarbeiter-Tabelle */}
      {offen && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="py-2 pr-3">Mitarbeiter</th>
                  <th className="py-2 pr-3 text-right">Ist-Std.</th>
                  <th className="py-2 pr-3 text-right">Anteil</th>
                  <th className="py-2 pr-3 text-right">Guthaben</th>
                  <th className="py-2 text-right">Puffer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {p.mitarbeiter.map((ma) => (
                  <tr key={ma.mitarbeiterId} className="hover:bg-white/60">
                    <td className="py-2 pr-3 font-medium text-gray-700">{ma.mitarbeiterName}</td>
                    <td className="py-2 pr-3 text-right text-gray-500">
                      <StdAnzeige h={ma.istStunden} />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className="font-semibold text-info-600">{ma.anteilProz.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className={ma.guthabenAktuell >= 0 ? 'text-bonus-600 font-medium' : 'text-malus-600 font-medium'}>
                        <StdAnzeige h={ma.guthabenAktuell} prefix={autoPrefix(ma.guthabenAktuell)} />
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <span className={`font-medium ${
                        ma.pufferStunden < 0  ? 'text-malus-700' :
                        ma.pufferStunden < 10 ? 'text-grenz-700' :
                        'text-gray-600'
                      }`}>
                        <StdAnzeige h={ma.pufferStunden} prefix={autoPrefix(ma.pufferStunden)} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Puffer = verbleibender Projektsaldo · Guthaben = Saldo × Anteil (nur bei positivem Saldo)
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Gesamt-Kennzahlen ────────────────────────────────────────────────────────

function GesamtBanner({ data }: { data: PrognoseAntwort }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {[
        { label: 'Prognose Gesamt',  value: eur(data.gesamtPrognose), color: 'text-bonus-700', bg: 'bg-bonus-50'  },
        { label: 'Minimal-Szenario', value: eur(data.gesamtMin),      color: 'text-grenz-700', bg: 'bg-grenz-50'  },
        { label: 'Maximal-Szenario', value: eur(data.gesamtMax),      color: 'text-info-700',  bg: 'bg-info-50'   },
      ].map(({ label, value, color, bg }) => (
        <Card key={label} className={bg}>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-bold ${color} mt-1`}>{value}</p>
        </Card>
      ))}
    </div>
  );
}

// ─── Prognosesimulation-Tab ───────────────────────────────────────────────────

function SimulationsTab({
  sensi,
  jahr,
}: {
  sensi:  ProjektSensitivitaetAntwort;
  jahr:   number;
}) {
  const bonusProjekte = sensi.projekte.filter((p) => !p.bonusAusgeschlossen);

  const [slider,    setSlider]    = useState<Record<number, number>>(() => {
    const init: Record<number, number> = {};
    for (const p of bonusProjekte) init[p.projektId] = Math.min(p.auslastungProz, 150);
    return init;
  });
  const [ergebnis,  setErgebnis]  = useState<SimulationsErgebnis | null>(null);
  const [simLaden,  setSimLaden]  = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ladeSimulation = useCallback(async (aktuellerSlider: Record<number, number>) => {
    setSimLaden(true);
    try {
      const overrides = Object.entries(aktuellerSlider).map(([id, pct]) => ({
        projektId:                  Number(id),
        abschlussAuslastungProzent: pct,
      }));
      const res = await postSimulation(jahr, overrides);
      setErgebnis(res);
    } finally {
      setSimLaden(false);
    }
  }, [jahr]);

  useEffect(() => {
    ladeSimulation(slider);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSlider = (projektId: number, val: number) => {
    const neu = { ...slider, [projektId]: val };
    setSlider(neu);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => ladeSimulation(neu), 450);
  };

  const handleReset = () => {
    const init: Record<number, number> = {};
    for (const p of bonusProjekte) init[p.projektId] = Math.min(p.auslastungProz, 150);
    setSlider(init);
    ladeSimulation(init);
  };

  const gesamtDiff = ergebnis
    ? ergebnis.gesamt_simuliert - ergebnis.gesamt_aktuell
    : 0;

  return (
    <div className="space-y-5">
      {/* Hinweis-Banner */}
      <div className="flex items-start gap-3 bg-grenz-50 border border-grenz-200 rounded-xl px-4 py-3">
        <svg className="w-4 h-4 text-grenz-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
        </svg>
        <div className="text-sm">
          <p className="font-semibold text-grenz-700">Simulation — keine echten Daten</p>
          <p className="text-grenz-600 text-xs mt-0.5">
            Stelle die Endauslastung je Projekt ein und sieh sofort, wie sich das auf den Bonus auswirkt.
            Option-A-Stunden (Extrastunden) und Qualifikationsstatus bleiben unverändert.
          </p>
        </div>
      </div>

      {/* Ergebnis-Zusammenfassung */}
      {ergebnis && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Aktuell (Ist)</p>
            <p className="text-xl font-bold text-gray-700 mt-0.5">{eur(ergebnis.gesamt_aktuell)}</p>
          </div>
          <div className="bg-info-50 rounded-xl p-3">
            <p className="text-xs text-info-500 uppercase tracking-wide">Simuliert</p>
            <p className="text-xl font-bold text-info-700 mt-0.5">{eur(ergebnis.gesamt_simuliert)}</p>
          </div>
          <div className={`rounded-xl p-3 ${gesamtDiff >= 0 ? 'bg-bonus-50' : 'bg-malus-50'}`}>
            <p className={`text-xs uppercase tracking-wide ${gesamtDiff >= 0 ? 'text-bonus-500' : 'text-malus-500'}`}>Differenz</p>
            <p className={`text-xl font-bold mt-0.5 ${gesamtDiff >= 0 ? 'text-bonus-700' : 'text-malus-700'}`}>
              {gesamtDiff >= 0 ? '+' : ''}{eur(gesamtDiff)}
            </p>
          </div>
        </div>
      )}

      {/* Mitarbeiter-Vergleichstabelle */}
      {ergebnis && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Bonus-Vergleich je Mitarbeiter
          </p>
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                  <th className="py-2.5 px-4">Mitarbeiter</th>
                  <th className="py-2.5 px-3 text-right">Opt. B Ist</th>
                  <th className="py-2.5 px-3 text-right">Opt. B Sim.</th>
                  <th className="py-2.5 px-3 text-right">Gesamt Ist</th>
                  <th className="py-2.5 px-4 text-right">Differenz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ergebnis.mitarbeiter.map((ma) => (
                  <tr key={ma.mitarbeiterId} className={`${!ma.qualifiziert ? 'opacity-50' : ''}`}>
                    <td className="py-2.5 px-4 font-medium text-gray-800">
                      {ma.mitarbeiterName}
                      {!ma.qualifiziert && (
                        <span className="ml-2 text-xs text-gray-400">(nicht qualifiziert)</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-500">{eur(ma.optionB_aktuell)}</td>
                    <td className="py-2.5 px-3 text-right font-medium text-info-700">{eur(ma.optionB_simuliert)}</td>
                    <td className="py-2.5 px-3 text-right text-gray-600">{eur(ma.gesamt_aktuell)}</td>
                    <td className={`py-2.5 px-4 text-right font-bold ${
                      ma.differenz > 0 ? 'text-bonus-600' :
                      ma.differenz < 0 ? 'text-malus-600' : 'text-gray-400'
                    }`}>
                      {ma.differenz > 0 ? '+' : ''}{eur(ma.differenz)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Projekt-Schieberegler */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Projektauslastung simulieren ({bonusProjekte.length} Projekte)
          </p>
          <div className="flex items-center gap-3">
            {simLaden && (
              <span className="text-xs text-gray-400 animate-pulse">Wird berechnet…</span>
            )}
            <button
              onClick={handleReset}
              className="text-xs text-info-600 hover:text-info-800 font-medium transition-colors"
            >
              Zurücksetzen
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {bonusProjekte.map((proj) => {
            const val         = slider[proj.projektId] ?? proj.auslastungProz;
            const istVal      = Math.min(proj.auslastungProz, 150);
            const veraendert  = Math.abs(val - istVal) > 0.5;
            const simSaldo    = proj.sollStunden * (1 - val / 100);

            return (
              <div key={proj.projektId} className={`rounded-xl border p-4 transition-colors ${
                veraendert ? 'border-info-200 bg-info-50/40' : 'border-gray-100 bg-white'
              }`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{proj.projektname}</p>
                    <p className="text-xs text-gray-400">{proj.projektnummer}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${
                      simSaldo > 0 ? 'text-bonus-600' :
                      simSaldo < 0 ? 'text-malus-600' : 'text-gray-400'
                    }`}>
                      Sim. Saldo: {simSaldo >= 0 ? '+' : ''}{toHHMM(simSaldo)}
                    </p>
                    <p className="text-xs text-gray-400">Soll: {toHHMM(proj.sollStunden)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Ist: {proj.auslastungProz}%</span>
                      <span className={`font-semibold ${veraendert ? 'text-info-600' : 'text-gray-500'}`}>
                        Sim: {val}%
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="range"
                        min={0}
                        max={150}
                        step={1}
                        value={val}
                        onChange={(e) => handleSlider(proj.projektId, Number(e.target.value))}
                        className="w-full h-2 accent-info-600 cursor-pointer"
                      />
                      {/* Ist-Markierung */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-gray-400 rounded-full pointer-events-none"
                        style={{ left: `calc(${(istVal / 150) * 100}% - 2px)` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-300 mt-0.5">
                      <span>0%</span>
                      <span className="text-gray-400">|100%</span>
                      <span>150%</span>
                    </div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={150}
                    value={val}
                    onChange={(e) => handleSlider(proj.projektId, Math.min(150, Math.max(0, Number(e.target.value))))}
                    className="w-20 text-center text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-info-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function AdminPrognose() {
  const [jahr,      setJahr]      = useState(new Date().getFullYear());
  const [prognose,  setPrognose]  = useState<PrognoseAntwort | null>(null);
  const [sensi,     setSensi]     = useState<ProjektSensitivitaetAntwort | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [fehler,    setFehler]    = useState<string | null>(null);
  const [sortBy,    setSortBy]    = useState<'prognose' | 'name' | 'puffer'>('prognose');
  const [aktuellerTab, setAktuellerTab] = useState<'mitarbeiter' | 'projekte' | 'simulation'>('mitarbeiter');

  const laden = useCallback(async () => {
    setLoading(true);
    setFehler(null);
    try {
      const [p, s] = await Promise.all([
        getPrognose(jahr),
        getProjektSensitivitaet(jahr),
      ]);
      setPrognose(p);
      setSensi(s);
    } catch {
      setFehler('Prognosedaten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [jahr]);

  useEffect(() => { laden(); }, [laden]);

  if (loading) {
    return (
      <div className="space-y-4 animate-fadeIn">
        <SkeletonCard />
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-48" />
      </div>
    );
  }

  if (fehler || !prognose || !sensi) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-malus-600 font-medium">{fehler}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={laden}>Erneut versuchen</Button>
        </div>
      </div>
    );
  }

  const sortedMa = [...prognose.ergebnisse].sort((a, b) => {
    if (sortBy === 'name')   return a.mitarbeiterName.localeCompare(b.mitarbeiterName);
    if (sortBy === 'puffer') return a.risikoStundenPuffer - b.risikoStundenPuffer;
    return b.prognoseBetrag - a.prognoseBetrag;
  });

  const kritischMA = prognose.ergebnisse.filter(
    (e) => e.risikoStundenPuffer !== -1 && e.risikoStundenPuffer < 10,
  );

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {jahr < new Date().getFullYear() ? `Jahresauswertung ${jahr}` : `Jahresprognose ${jahr}`}
            {jahr < new Date().getFullYear() && (
              <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-grenz-100 text-grenz-700">Abgeschlossen</span>
            )}
          </h2>
          <p className="text-sm text-gray-400">
            Jahresfortschritt: <span className="font-medium text-grenz-600">{prognose.jahresfortschritt}%</span>
            {' · '}{jahr < new Date().getFullYear() ? 'Endabrechnung' : 'Lineare Hochrechnung'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <YearPicker value={jahr} onChange={setJahr} />
          <Button variant="secondary" size="sm" onClick={laden}>Aktualisieren</Button>
        </div>
      </div>

      {/* Kritische Warnungen */}
      {(kritischMA.length > 0 || sensi.kritischeProjekte > 0) && (
        <div className="bg-malus-50 border border-malus-200 rounded-xl p-4 flex gap-3">
          <svg className="w-5 h-5 text-malus-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          </svg>
          <div className="text-sm">
            {kritischMA.length > 0 && (
              <p className="text-malus-700">
                <strong>{kritischMA.length} Mitarbeiter</strong> mit Stunden-Puffer &lt; 10 h:{' '}
                {kritischMA.map((e) => e.mitarbeiterName).join(', ')}
              </p>
            )}
            {sensi.kritischeProjekte > 0 && (
              <p className={`text-malus-700 ${kritischMA.length > 0 ? 'mt-1' : ''}`}>
                <strong>{sensi.kritischeProjekte} Projekte</strong> mit kritischem Saldo (unter 10 h)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Gesamt-Banner */}
      <GesamtBanner data={prognose} />

      {/* Tabs */}
      <Card>
        <Tabs aktiv={aktuellerTab} onChange={(t) => setAktuellerTab(t as 'mitarbeiter' | 'projekte' | 'simulation')} />

        {/* Tab 1: Mitarbeiter-Prognose */}
        {aktuellerTab === 'mitarbeiter' && (
          <div className="space-y-5">
            {/* Chart */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Prognose-Verlauf</p>
              <LineChart data={prognose.ergebnisse} fortschritt={prognose.jahresfortschritt} />
            </div>

            {/* Mitarbeiter-Liste */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Mitarbeiter ({sortedMa.length})
                </p>
                <div className="flex gap-1">
                  {([
                    { key: 'prognose', label: 'Prognose' },
                    { key: 'name',     label: 'Name'     },
                    { key: 'puffer',   label: 'Puffer'   },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setSortBy(key)}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                        sortBy === key
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                {sortedMa.map((e) => <MitarbeiterKarte key={e.mitarbeiterId} e={e} />)}
                {sortedMa.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">Keine Prognosedaten</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Projekt-Sensitivität */}
        {aktuellerTab === 'projekte' && (
          <div className="space-y-3">
            {/* Gesamt-Puffer-Banner */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Ges. Stunden-Puffer',  v: <StdAnzeige h={sensi.gesamtPufferStunden} prefix="+" />, c: 'text-bonus-700' },
                { label: 'Kritische Projekte',   v: String(sensi.kritischeProjekte),              c: sensi.kritischeProjekte > 0 ? 'text-malus-700' : 'text-gray-700' },
                { label: 'Aktive Projekte',      v: String(sensi.projekte.length),                c: 'text-gray-700' },
              ].map(({ label, v, c }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
                  <p className={`text-xl font-bold ${c} mt-0.5`}>{v}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-400 mb-3">
              Klick auf Projekt → Mitarbeiter-Aufschlüsselung mit Anteil, Guthaben und individuellem Puffer
            </p>

            {/* Projekt-Karten (kritischste zuerst — Backend-sortiert) */}
            {sensi.projekte.map((p) => (
              <ProjektSensKarte key={p.projektId} p={p} />
            ))}

            {sensi.projekte.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400">Keine aktiven Projekte</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Prognosesimulation */}
        {aktuellerTab === 'simulation' && (
          <SimulationsTab sensi={sensi} jahr={jahr} />
        )}
      </Card>

      {/* Methodik-Hinweis */}
      <Card>
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-info-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
          </svg>
          <div className="text-xs text-gray-500 space-y-1">
            <p className="font-semibold text-gray-700">Berechnungsmethodik (Backend)</p>
            <p><strong>Jahresfortschritt</strong>: Vergangene Tage / 365 × 100 %</p>
            <p><strong>Prognose</strong>: Aktueller Bonus ÷ Jahresfortschritt = hochgerechneter Jahreswert</p>
            <p><strong>Min</strong>: Eingefrierter aktueller Stand (kein weiterer Fortschritt).</p>
            <p><strong>Max</strong>: Prognose × 1,15 (15 % Optimismus-Puffer).</p>
            <p><strong>Stunden-Puffer</strong>: Verbleibender Projektsaldo geteilt durch MA-Anteil → wann dreht Saldo ins Minus.</p>
            <p><strong>Projekt-Sensitivität</strong>: Alle Werte werden im Backend berechnet und vom Frontend nur angezeigt.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
