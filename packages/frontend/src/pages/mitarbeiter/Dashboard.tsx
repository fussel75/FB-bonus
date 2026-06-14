/**
 * Mitarbeiter-Dashboard — Hero-Seite mit animierter Jahresauszahlung
 *
 * Layout (Mobile-first):
 *   1. Hero-Card: Große animierte €-Zahl + Option A/B-Breakdown
 *   2. Qualifikations-Badge + KranktageBalken
 *   3. Projekt-Schnellübersicht (Top 3)
 *   4. Prognose-Hinweis
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '@/hooks/useFetch';
import { mitarbeiterApi } from '@/api/mitarbeiter';
import { HeroCounter, AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { KranktageBalken } from '@/components/shared/KranktageBalken';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { StdAnzeige, autoPrefix } from '@/components/ui/StdAnzeige';

const AKTUELLES_JAHR = new Date().getFullYear();

// ─── Mini-Stat-Box ────────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  variant,
  loading,
}: {
  label:   string;
  value:   number;
  variant: 'bonus' | 'malus' | 'grenz' | 'info';
  loading: boolean;
}) {
  const colorMap = {
    bonus: 'text-bonus-600',
    malus: 'text-malus-600',
    grenz: 'text-grenz-600',
    info:  'text-info-600',
  };

  if (loading) {
    return (
      <div className="flex-1 min-w-0">
        <div className="h-3 w-16 rounded bg-white/30 mb-1.5 animate-pulse_soft" />
        <div className="h-6 w-24 rounded bg-white/30 animate-pulse_soft" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs text-white/70 mb-0.5 truncate">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${colorMap[variant]}`}>
        <AnimatedCounter value={value} decimals={2} suffix=" €" className="text-white" />
      </p>
    </div>
  );
}

// ─── Qualifikations-Badge ─────────────────────────────────────────────────────

function QualiBadge({
  qualifiziert,
  grund,
  loading,
}: {
  qualifiziert: boolean;
  grund?:       string;
  loading:      boolean;
}) {
  if (loading) {
    return <div className="h-6 w-32 rounded-full bg-gray-100 animate-pulse_soft" />;
  }

  if (qualifiziert) {
    return (
      <Badge variant="bonus" dot>
        Anspruch qualifiziert
      </Badge>
    );
  }

  return (
    <div className="space-y-1">
      <Badge variant="malus" dot>
        Kein Auszahlungsanspruch
      </Badge>
      {grund && (
        <p className="text-xs text-malus-600 pl-1">{grund}</p>
      )}
    </div>
  );
}

// ─── Projekt-Mini-Karte ───────────────────────────────────────────────────────

function ProjektMiniCard({
  name,
  saldo,
  guthabenStunden,
  sollStunden,
  istStunden,
}: {
  name:            string;
  saldo:           number;
  guthabenStunden: number;
  sollStunden:     number;
  istStunden:      number;
}) {
  const pct     = Math.min((istStunden / Math.max(sollStunden, 1)) * 100, 110);
  const positiv = saldo >= 0;

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
      {/* Status-Dot */}
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${positiv ? 'bg-bonus-500' : 'bg-malus-400'}`} />

      {/* Projekt-Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
        <ProgressBar
          value={istStunden}
          max={sollStunden}
          variant={pct > 100 ? 'malus' : pct > 80 ? 'grenz' : 'bonus'}
          size="sm"
          className="mt-1"
        />
      </div>

      {/* Guthaben */}
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-semibold tabular-nums ${positiv ? 'text-bonus-600' : 'text-malus-500'}`}>
          <StdAnzeige h={guthabenStunden} prefix={positiv ? '+' : '−'} />
        </p>
      </div>
    </div>
  );
}

// ─── Dashboard-Hauptkomponente ────────────────────────────────────────────────

export default function MitarbeiterDashboard() {
  const [jahr] = useState(AKTUELLES_JAHR);

  const {
    data:    meData,
    loading: meLoading,
  } = useFetch(() => mitarbeiterApi.getMe(), []);

  const {
    data:    bonusData,
    loading: bonusLoading,
  } = useFetch(() => mitarbeiterApi.getMeBonus(jahr), [jahr]);

  const {
    data:    prognoseData,
    loading: prognoseLoading,
  } = useFetch(() => mitarbeiterApi.getMePrognose(jahr), [jahr]);

  const b           = bonusData?.berechnung;
  const isLoading   = meLoading || bonusLoading;
  const gesamtBetrag = b?.gesamtBetrag ?? 0;

  // Top-3-Projekte nach absolutem Guthaben sortieren
  const topProjekte = (b?.projekte ?? [])
    .slice()
    .sort((a, c) => Math.abs(c.guthabenStunden) - Math.abs(a.guthabenStunden))
    .slice(0, 3);

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* ── Hero-Card ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-info-600 text-white p-5 sm:p-6 shadow-card overflow-hidden relative">
        {/* Dezente Hintergrund-Ornamente (Flat: nur opacity, kein Gradient) */}
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full bg-white/5 pointer-events-none" />

        <div className="relative">
          {/* Jahr + Titel */}
          <p className="text-white/70 text-sm font-medium mb-2">
            Voraussichtliche Jahresauszahlung {jahr}
          </p>

          {/* Animierter €-Zähler */}
          {isLoading ? (
            <div className="h-14 w-56 rounded-xl bg-white/15 animate-pulse_soft mb-4" />
          ) : (
            <HeroCounter value={gesamtBetrag} loading={false} className="mb-4" />
          )}

          {/* Option A + B Breakdown */}
          <div className="flex gap-6 mb-5">
            <StatBox
              label={`Option A (Zusatzstd.)`}
              value={b?.optionA_betrag ?? 0}
              variant="bonus"
              loading={isLoading}
            />
            <StatBox
              label={`Option B (Effizienz)`}
              value={b?.optionB_betrag ?? 0}
              variant="bonus"
              loading={isLoading}
            />
          </div>

          {/* Trennlinie */}
          <div className="border-t border-white/20 pt-4 space-y-3">
            {/* Qualifikations-Badge */}
            <QualiBadge
              qualifiziert={b?.qualifiziert ?? true}
              grund={b?.disqualGrund}
              loading={isLoading}
            />

            {/* Kranktage-Balken (im Hero, helle Variante) */}
            {isLoading ? (
              <div className="h-8 rounded-lg bg-white/15 animate-pulse_soft" />
            ) : meData ? (
              <div className="bg-white/10 rounded-xl px-3 py-2.5">
                <KranktageBalken
                  kranktage={meData.kranktageAktuellesJahr}
                  schwellenwert={meData.kranktageSchwell}
                  showNumbers
                />
              </div>
            ) : null}

            {/* Krankheits-Kürzungs-Hinweis */}
            {!isLoading && b && b.qualifiziert && b.kranken_faktor_prozent < 100 && (
              <div className="bg-white/10 rounded-xl px-3 py-2.5 text-xs space-y-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-white/80">
                    Krankheitstage: <span className="font-semibold text-white">{b.kranktage}</span>
                    {meData?.kranktageSchwell ? <> · Karenz: {meData.kranktageSchwell}</> : null}
                  </span>
                  <span className="font-semibold text-white">
                    {b.kranken_faktor_prozent.toLocaleString('de-DE', { maximumFractionDigits: 0 })} %
                  </span>
                </div>
                <div className="flex justify-between gap-2 text-white/70">
                  <span>Bonus-Kürzung</span>
                  <span className="tabular-nums">
                    −{b.kranken_kuerzung_eur.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </span>
                </div>
                <p className="text-white/60 leading-snug pt-0.5">
                  Ab Tag {meData?.kranktageSchwell ?? 15} wird der Bonus stufenweise reduziert.
                  {b.efzg_aktiv && b.efzg_max_kuerzung_eur !== null && (
                    <> § 4a EFZG: max. Kürzung {b.efzg_max_kuerzung_eur.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}.</>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Prognose-Banner ────────────────────────────────────────────────── */}
      {!prognoseLoading && prognoseData && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-grenz-50 border border-grenz-200 animate-fadeIn">
          <svg className="w-4 h-4 text-grenz-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
          </svg>
          <p className="text-sm text-grenz-700 flex-1">
            <span className="font-semibold">Hochrechnung Jahresende:</span>{' '}
            <AnimatedCounter value={prognoseData.prognoseBetrag} className="font-bold text-grenz-800" />
            {' '}(bei gleichbleibendem Tempo)
          </p>
          <span className="text-xs text-grenz-500 flex-shrink-0">
            {prognoseData.jahresfortschritt}% des Jahres
          </span>
        </div>
      )}

      {/* ── Projekt-Schnellübersicht ────────────────────────────────────────── */}
      <Card padding="none">
        <div className="px-5 pt-4 pb-2">
          <CardHeader>
            <CardTitle>Meine Projekte</CardTitle>
            <Link
              to="/mitarbeiter/projekte"
              className="text-xs text-info-600 hover:text-info-700 font-medium"
            >
              Alle ansehen →
            </Link>
          </CardHeader>
        </div>

        <div className="px-5 pb-4">
          {bonusLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <div className="w-2 h-2 rounded-full bg-gray-200 animate-pulse_soft flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-1/3 rounded bg-gray-100 animate-pulse_soft" />
                    <div className="h-1.5 w-full rounded-full bg-gray-100 animate-pulse_soft" />
                  </div>
                  <div className="h-4 w-14 rounded bg-gray-100 animate-pulse_soft" />
                </div>
              ))}
            </div>
          ) : topProjekte.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Noch keine Projektdaten vorhanden
            </p>
          ) : (
            topProjekte.map((proj) => (
              <ProjektMiniCard
                key={proj.projektId}
                name={proj.projektname}
                saldo={proj.saldo}
                guthabenStunden={proj.guthabenStunden}
                sollStunden={proj.sollStunden}
                istStunden={proj.istStunden}
              />
            ))
          )}
        </div>
      </Card>

      {/* ── Option A + B Info-Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card padding="md">
          <CardTitle className="mb-3">Option A — Zusatzstunden</CardTitle>
          {isLoading ? (
            <SkeletonCard className="!shadow-none !border-0 !p-0" />
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <span className="text-sm text-gray-500">Stunden gesamt</span>
                <span className="text-lg font-bold text-gray-900 tabular-nums">
                  <StdAnzeige h={b?.optionA_stunden ?? 0} />
                </span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-sm text-gray-500">Bonusbetrag</span>
                <span className="text-lg font-bold text-bonus-600 tabular-nums">
                  <AnimatedCounter value={b?.optionA_betrag ?? 0} />
                </span>
              </div>
              {/* Wurst-Abzug — nur anzeigen wenn > 0 */}
              {b && b.wurst_abzug_stunden > 0 && (
                <div className="mt-1 rounded-lg bg-malus-50 border border-malus-200 px-3 py-2 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-malus-700">⚠ Offene Wurststunden</span>
                  </div>
                  <div className="flex justify-between text-xs text-malus-600">
                    <span>Noch nicht zugeordnet</span>
                    <span className="font-medium tabular-nums">
                      −<StdAnzeige h={b.wurst_abzug_stunden} />
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-malus-700 font-semibold">
                    <span>Abzug</span>
                    <span className="tabular-nums">
                      −{b.wurst_abzug_betrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                    </span>
                  </div>
                  <p className="text-xs text-malus-500 leading-tight pt-0.5">
                    Wird gutgeschrieben sobald alle Positionen zugeordnet sind.
                  </p>
                </div>
              )}
              <Link
                to="/mitarbeiter/historie?typ=option_a"
                className="block text-xs text-info-600 hover:text-info-700 font-medium pt-1"
              >
                Buchungshistorie ansehen →
              </Link>
            </div>
          )}
        </Card>

        <Card padding="md">
          <CardTitle className="mb-3">Option B — Projekteffizienz</CardTitle>
          {isLoading ? (
            <SkeletonCard className="!shadow-none !border-0 !p-0" />
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <span className="text-sm text-gray-500">Jahressaldo</span>
                <span className={`text-lg font-bold tabular-nums ${(b?.optionB_jahressaldo ?? 0) >= 0 ? 'text-bonus-600' : 'text-malus-500'}`}>
                  <StdAnzeige h={b?.optionB_jahressaldo ?? 0} prefix={autoPrefix(b?.optionB_jahressaldo ?? 0)} />
                </span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-sm text-gray-500">Bonusbetrag</span>
                <span className="text-lg font-bold text-bonus-600 tabular-nums">
                  <AnimatedCounter value={b?.optionB_betrag ?? 0} />
                </span>
              </div>
              <Link
                to="/mitarbeiter/projekte"
                className="block text-xs text-info-600 hover:text-info-700 font-medium pt-1"
              >
                Projektdetails ansehen →
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
