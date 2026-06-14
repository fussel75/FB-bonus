/**
 * Mitarbeiter-Projektseite
 *
 * Je Projekt:
 *   - Fortschrittsbalken Soll vs. Ist mit Schwellenwert-Markierung
 *   - Eigener Stundenanteil + Bonus/Malus in Stunden und €
 *   - Zustandsbadge: bonusrelevant oder noch nicht relevant (mit Auslastung%)
 *   - Tap → Detail-Modal mit vollständigem Rechenweg
 */

import { useState } from 'react';
import { useFetch } from '@/hooks/useFetch';
import { mitarbeiterApi } from '@/api/mitarbeiter';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { fmtNum, fmtH, toHHMM } from '@/lib/fmt';
import { StdAnzeige, autoPrefix } from '@/components/ui/StdAnzeige';
import type { BonusProjektDetail } from '@/types';

const AKTUELLES_JAHR = new Date().getFullYear();

// ─── Fortschrittsbalken mit Schwellenwert-Markierung ─────────────────────────

function ProjektFortschritt({
  istStunden,
  sollStunden,
  schwelleProzent,
  size = 'md',
}: {
  istStunden:      number;
  sollStunden:     number;
  schwelleProzent: number;
  size?:           'sm' | 'md';
}) {
  const pct        = sollStunden > 0 ? Math.min((istStunden / sollStunden) * 100, 110) : 0;
  const ueber100   = pct > 100;
  const fillColor  = ueber100 ? 'bg-malus-500' : pct >= schwelleProzent ? 'bg-bonus-500' : 'bg-grenz-400';
  const trackColor = ueber100 ? 'bg-malus-100' : pct >= schwelleProzent ? 'bg-bonus-100' : 'bg-gray-100';
  const h          = size === 'sm' ? 'h-2' : 'h-2.5';

  return (
    <div className="relative w-full">
      <div className={`w-full rounded-full overflow-hidden ${trackColor} ${h}`}>
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${fillColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {/* Schwellenwert-Marker */}
      {schwelleProzent > 0 && schwelleProzent < 100 && (
        <div
          className="absolute top-0 bottom-0 flex flex-col items-center"
          style={{ left: `${schwelleProzent}%` }}
        >
          <div className={`w-0.5 ${h} bg-gray-500 opacity-60 rounded-full`} />
        </div>
      )}
    </div>
  );
}

// ─── Rechenweg-Step-Karte ────────────────────────────────────────────────────

function RechenStep({
  schritt,
  formel,
  wert,
  einheit,
  highlight,
  gedimmt,
}: {
  schritt:    string;
  formel:     string;
  wert:       string;
  einheit:    string;
  highlight?: boolean;
  gedimmt?:   boolean;
}) {
  return (
    <div className={`rounded-xl p-3 ${
      gedimmt    ? 'bg-gray-50 opacity-60' :
      highlight  ? 'bg-bonus-50 border border-bonus-200' :
      'bg-gray-50'
    }`}>
      <p className="text-xs text-gray-400 font-medium mb-0.5">{schritt}</p>
      <p className="text-xs text-gray-500 mb-1.5 font-mono leading-relaxed">{formel}</p>
      <p className={`text-base font-bold tabular-nums ${highlight ? 'text-bonus-700' : 'text-gray-800'}`}>
        {wert} <span className="text-sm font-medium">{einheit}</span>
      </p>
    </div>
  );
}

// ─── Detail-Modal mit transparentem Rechenweg ────────────────────────────────

function ProjektDetailModal({
  projekt,
  stundensatzB,
  schwelleProzent,
  onClose,
}: {
  projekt:         BonusProjektDetail;
  stundensatzB:    number;
  schwelleProzent: number;
  onClose:         () => void;
}) {
  const positiv    = projekt.guthabenStunden >= 0;
  const nichtRelevant = !projekt.istBonusrelevant;

  return (
    <Modal open onClose={onClose} title={projekt.projektname} size="lg">
      <div className="space-y-3 -mt-1">

        {/* Nicht-relevant Hinweis */}
        {nichtRelevant && (
          <div className="flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
            <span className="text-base mt-0.5">⏳</span>
            <p className="text-xs text-gray-600 leading-relaxed">
              Dieses Projekt fließt noch <span className="font-semibold">nicht</span> in deinen Bonus ein.
              Ab <span className="font-semibold">{schwelleProzent} % Auslastung</span> wird es bonusrelevant —
              aktuell: <span className="font-semibold">{fmtNum(projekt.auslastungProzent, 0)} %</span>.
              Abgeschlossene Projekte zählen immer.
            </p>
          </div>
        )}

        {/* Projekt-Übersicht */}
        <div className="grid grid-cols-3 gap-2 text-center mb-1">
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-400 mb-0.5">Soll</p>
            <p className="text-base font-bold text-gray-800 tabular-nums"><StdAnzeige h={projekt.sollStunden} /></p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-400 mb-0.5">Ist</p>
            <p className="text-base font-bold text-gray-800 tabular-nums"><StdAnzeige h={projekt.istStunden} /></p>
          </div>
          <div className={`rounded-lg p-2.5 ${projekt.saldo >= 0 ? 'bg-bonus-50' : 'bg-malus-50'}`}>
            <p className="text-xs text-gray-400 mb-0.5">Saldo</p>
            <p className={`text-base font-bold tabular-nums ${projekt.saldo >= 0 ? 'text-bonus-700' : 'text-malus-600'}`}>
              <StdAnzeige h={nichtRelevant ? 0 : projekt.saldo} prefix={autoPrefix(projekt.saldo)} />
            </p>
          </div>
        </div>

        {/* Fortschrittsbalken mit Schwelle */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Ist / Soll</span>
            <span className="font-medium">{fmtNum(projekt.auslastungProzent, 0)} %</span>
          </div>
          <ProjektFortschritt
            istStunden={projekt.istStunden}
            sollStunden={projekt.sollStunden}
            schwelleProzent={schwelleProzent}
            size="md"
          />
          <p className="text-xs text-gray-400">
            Schwelle bei <span className="font-medium">{schwelleProzent} %</span> · danach zählt der Saldo
          </p>
        </div>

        {/* Trennlinie */}
        <div className="border-t border-gray-100 pt-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
            Transparenter Rechenweg — Dein Anteil
          </p>
        </div>

        {/* Schritt 1 */}
        <RechenStep
          schritt="Schritt 1 — Gewichtungspunkte"
          formel={`${projekt.istStunden > 0 ? fmtH(projekt.istStunden) : '–'} geleistet × Rollenfaktor = Punkte`}
          wert={fmtNum(projekt.punkte, 2)}
          einheit="Punkte"
          gedimmt={nichtRelevant}
        />

        {/* Schritt 2 */}
        <RechenStep
          schritt="Schritt 2 — Gewichteter Anteil"
          formel="Deine Punkte / Summe aller Punkte im Projekt"
          wert={fmtNum(projekt.anteilProzent, 1) + ' %'}
          einheit="Anteil"
          gedimmt={nichtRelevant}
        />

        {/* Schritt 3 */}
        <RechenStep
          schritt="Schritt 3 — Guthabenstunden"
          formel={nichtRelevant
            ? `Saldo = 0 (Projekt noch nicht bonusrelevant)`
            : `Projektsaldo (${projekt.saldo >= 0 ? '+' : ''}${fmtH(projekt.saldo)}) × ${fmtNum(projekt.anteilProzent, 1)} %`
          }
          wert={nichtRelevant ? '0' : (projekt.guthabenStunden >= 0 ? '+' : '') + fmtNum(projekt.guthabenStunden, 2)}
          einheit="Stunden"
          highlight={!nichtRelevant && positiv}
          gedimmt={nichtRelevant}
        />

        {/* Stundensatz-Hinweis */}
        <div className="bg-info-50 rounded-xl p-3 border border-info-100">
          <p className="text-xs text-info-600 leading-relaxed">
            <span className="font-semibold">Jahressaldo:</span> Die Guthabenstunden aller Projekte werden summiert.{' '}
            Erst am Jahresende wird der Gesamtsaldo mit dem Stundensatz von{' '}
            <span className="font-bold">{fmtNum(stundensatzB, 2)} €/h</span> multipliziert.{' '}
            Ein negativer Jahressaldo wird auf 0 € gesetzt — kein Abzug.
          </p>
        </div>

        {/* Vorläufiger Betrag */}
        {!nichtRelevant && (
          <div className={`rounded-xl p-4 ${positiv ? 'bg-bonus-50 border border-bonus-200' : 'bg-malus-50 border border-malus-100'}`}>
            <p className="text-xs font-medium text-gray-500 mb-1">Vorläufiger Beitrag aus diesem Projekt</p>
            <p className={`text-2xl font-bold tabular-nums ${positiv ? 'text-bonus-700' : 'text-malus-600'}`}>
              {positiv ? '+' : ''}{fmtNum(projekt.guthabenStunden * stundensatzB, 2)} €
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {projekt.guthabenStunden >= 0 ? '+' : ''}{fmtNum(projekt.guthabenStunden, 2)} h × {fmtNum(stundensatzB, 2)} €/h
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Einzelne Projekt-Karte ───────────────────────────────────────────────────

function ProjektKarte({
  projekt,
  stundensatzB,
  schwelleProzent,
  onDetail,
}: {
  projekt:         BonusProjektDetail;
  stundensatzB:    number;
  schwelleProzent: number;
  onDetail:        () => void;
}) {
  const positiv      = projekt.guthabenStunden >= 0;
  const betrag       = projekt.guthabenStunden * stundensatzB;
  const nichtRelevant = !projekt.istBonusrelevant;

  return (
    <Card padding="md" onClick={onDetail}>
      {/* Kopfzeile */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className={`font-semibold truncate ${nichtRelevant ? 'text-gray-500' : 'text-gray-900'}`}>
            {projekt.projektname}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
            Soll: {toHHMM(projekt.sollStunden)} · Ist: {toHHMM(projekt.istStunden)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {nichtRelevant ? (
            <Badge variant="neutral">
              ⏳ {fmtNum(projekt.auslastungProzent, 0)} % · noch nicht relevant
            </Badge>
          ) : (
            <Badge variant={positiv ? 'bonus' : 'malus'} dot>
              {positiv ? 'Effizienzgewinn' : 'Überzug'}
            </Badge>
          )}
          <span className="text-xs text-gray-300">Details →</span>
        </div>
      </div>

      {/* Fortschrittsbalken mit Schwellenwert-Markierung */}
      <div className="mb-3">
        <ProjektFortschritt
          istStunden={projekt.istStunden}
          sollStunden={projekt.sollStunden}
          schwelleProzent={schwelleProzent}
        />
      </div>

      {/* Stats-Zeile */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Mein Anteil</p>
          <p className={`text-sm font-semibold tabular-nums ${nichtRelevant ? 'text-gray-400' : 'text-gray-700'}`}>
            {fmtNum(projekt.anteilProzent, 1)} %
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Guthaben</p>
          {nichtRelevant ? (
            <p className="text-sm font-semibold text-gray-300 tabular-nums">—</p>
          ) : (
            <p className={`text-sm font-semibold tabular-nums ${positiv ? 'text-bonus-600' : 'text-malus-500'}`}>
              <StdAnzeige h={projekt.guthabenStunden} prefix={positiv ? '+' : '−'} />
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Vorläufig</p>
          {nichtRelevant ? (
            <p className="text-sm font-semibold text-gray-300 tabular-nums">—</p>
          ) : (
            <p className={`text-sm font-semibold tabular-nums ${positiv ? 'text-bonus-600' : 'text-malus-500'}`}>
              <AnimatedCounter value={betrag} prefix={positiv ? '+' : ''} />
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function MitarbeiterProjekte() {
  const [detailProjekt, setDetailProjekt] = useState<BonusProjektDetail | null>(null);

  const {
    data:    bonusData,
    loading: bonusLoading,
  } = useFetch(() => mitarbeiterApi.getMeBonus(AKTUELLES_JAHR), []);

  const {
    data: prognoseData,
  } = useFetch(() => mitarbeiterApi.getMePrognose(AKTUELLES_JAHR), []);

  const projekte         = bonusData?.berechnung?.projekte ?? [];
  const stundensatz      = bonusData?.berechnung?.optionB_betrag !== undefined
    ? 30
    : 30;
  const schwelleProzent  = bonusData?.berechnung?.mindestAuslastungProzent ?? 90;

  const jahressaldo  = bonusData?.berechnung?.optionB_jahressaldo ?? 0;
  const jahresbetrag = bonusData?.berechnung?.optionB_betrag      ?? 0;

  const relevanteAnzahl    = projekte.filter((p) => p.istBonusrelevant).length;
  const nichtRelevanteAnzahl = projekte.filter((p) => !p.istBonusrelevant).length;

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* ── Jahressaldo-Banner ──────────────────────────────────────────────── */}
      {!bonusLoading && (
        <div className={`rounded-2xl p-4 sm:p-5 ${jahressaldo >= 0 ? 'bg-bonus-50 border border-bonus-200' : 'bg-malus-50 border border-malus-100'}`}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-0.5">Option B — Jahressaldo {AKTUELLES_JAHR}</p>
              <p className={`text-2xl font-bold tabular-nums ${jahressaldo >= 0 ? 'text-bonus-700' : 'text-malus-600'}`}>
                <StdAnzeige h={jahressaldo} prefix={autoPrefix(jahressaldo)} />
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Summe aller Projektguthaben · Boden: 0 h (kein Abzug)
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 mb-0.5">Voraussichtlicher Bonus</p>
              <p className={`text-xl font-bold tabular-nums ${jahressaldo >= 0 ? 'text-bonus-700' : 'text-gray-400'}`}>
                <AnimatedCounter value={jahresbetrag} />
              </p>
              {prognoseData && (
                <p className="text-xs text-grenz-600 mt-0.5">
                  Prognose: <AnimatedCounter value={prognoseData.prognoseBetrag} className="font-semibold" />
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Hinweis-Callout: Schwellenwert-Regel ────────────────────────────── */}
      {!bonusLoading && projekte.length > 0 && (
        <div className="flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p className="text-xs text-gray-500 leading-relaxed">
            Projekte fließen erst ab <span className="font-semibold text-gray-700">{schwelleProzent} % Auslastung</span> in deinen Bonus ein.
            Abgeschlossene Projekte zählen immer.
            {nichtRelevanteAnzahl > 0 && (
              <span className="ml-1">
                — Aktuell <span className="font-semibold">{relevanteAnzahl} von {projekte.length}</span> Projekten bonusrelevant.
              </span>
            )}
          </p>
        </div>
      )}

      {/* ── Projekt-Liste ───────────────────────────────────────────────────── */}
      {bonusLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : projekte.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-600">Noch keine Projekte vorhanden</p>
          <p className="text-xs text-gray-400 mt-1">Projekte werden täglich synchronisiert</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projekte.map((proj) => (
            <ProjektKarte
              key={proj.projektId}
              projekt={proj}
              stundensatzB={stundensatz}
              schwelleProzent={schwelleProzent}
              onDetail={() => setDetailProjekt(proj)}
            />
          ))}
        </div>
      )}

      {/* ── Detail-Modal ────────────────────────────────────────────────────── */}
      {detailProjekt && (
        <ProjektDetailModal
          projekt={detailProjekt}
          stundensatzB={stundensatz}
          schwelleProzent={schwelleProzent}
          onClose={() => setDetailProjekt(null)}
        />
      )}
    </div>
  );
}
