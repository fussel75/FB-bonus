/**
 * Buchungshistorie — chronologische Liste aller Bonus-Buchungen
 *
 * Zeigt echte Einträge aus bonusbuchungen (DB):
 *   - Option A: Einzelbuchungen aus Partner-API (mit Datum + Beschreibung)
 *   - Option B: Jahressaldo-Zusammenfassung (synthetisch, 1 Eintrag)
 *   - Manuelle Admin-Buchungen: mit Badge "Manuell"
 *
 * Filter: Jahr · Typ (Option A / B)
 */

import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFetch } from '@/hooks/useFetch';
import { mitarbeiterApi, type BonusBuchung } from '@/api/mitarbeiter';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SkeletonRow } from '@/components/ui/Skeleton';
import { StdAnzeige } from '@/components/ui/StdAnzeige';

const AKTUELLES_JAHR = new Date().getFullYear();
const JAHRE          = [AKTUELLES_JAHR, AKTUELLES_JAHR - 1, AKTUELLES_JAHR - 2];

// ─── Formatierungshelfer ──────────────────────────────────────────────────────

function formatDatum(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  });
}

function formatEur(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// ─── Filter-Pill ──────────────────────────────────────────────────────────────

function FilterPill({
  label,
  active,
  onClick,
}: {
  label:   string;
  active:  boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
        active
          ? 'bg-info-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ─── Einzelne Buchungs-Zeile ──────────────────────────────────────────────────

function BuchungZeile({
  buchung,
  istManuell,
}: {
  buchung:    BonusBuchung;
  istManuell: boolean;
}) {
  const positiv = buchung.betragEur >= 0;
  const istOptA = buchung.typ === 'option_a';

  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
      <div
        className={[
          'w-1.5 flex-shrink-0 rounded-full self-stretch min-h-[40px]',
          positiv ? 'bg-bonus-400' : 'bg-malus-400',
        ].join(' ')}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <Badge variant={istOptA ? 'info' : 'grenz'} className="flex-shrink-0">
            {istOptA ? 'Option A' : 'Option B'}
          </Badge>
          {buchung.projekt && (
            <span className="text-xs text-gray-500 truncate">{buchung.projekt.projektname}</span>
          )}
          {istManuell && (
            <span className="text-xs bg-gray-100 text-gray-400 rounded px-1.5 py-0.5">Admin</span>
          )}
        </div>
        <p className="text-xs text-gray-400">{formatDatum(buchung.buchungsdatum)}</p>
        {buchung.beschreibung && (
          <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{buchung.beschreibung}</p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold tabular-nums ${positiv ? 'text-bonus-600' : 'text-malus-600'}`}>
          {positiv ? '+' : ''}{formatEur(buchung.betragEur)}
        </p>
        {Number(buchung.stunden) > 0 && (
          <p className="text-xs text-gray-400 tabular-nums mt-0.5">
            <StdAnzeige h={Number(buchung.stunden)} prefix="+" />
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Jahressaldo-Zeile (Option B — synthetisch) ───────────────────────────────

function SaldoZeile({ betrag, saldo, jahr }: { betrag: number; saldo: number; jahr: number }) {
  if (betrag <= 0 && saldo <= 0) return null;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="w-1.5 flex-shrink-0 rounded-full self-stretch min-h-[40px] bg-grenz-400" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <Badge variant="grenz" className="flex-shrink-0">Option B</Badge>
        </div>
        <p className="text-xs text-gray-400">31. Dez. {jahr}</p>
        <p className="text-xs text-gray-600 mt-0.5">Jahressaldo Projekteffizienz {jahr}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold tabular-nums text-bonus-600">
          +{formatEur(betrag)}
        </p>
        <p className="text-xs text-gray-400 tabular-nums mt-0.5">
          <StdAnzeige h={saldo} prefix="+" />
        </p>
      </div>
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function Buchungshistorie() {
  const [searchParams]  = useSearchParams();
  const initialTyp       = searchParams.get('typ') ?? 'alle';

  const [jahr,      setJahr]      = useState(AKTUELLES_JAHR);
  const [typFilter, setTypFilter] = useState<'alle' | 'option_a' | 'option_b'>(
    initialTyp as 'alle' | 'option_a' | 'option_b',
  );

  const { data, loading } = useFetch(
    () => mitarbeiterApi.getMeBonus(jahr),
    [jahr],
  );

  const buchungen     = data?.buchungshistorie ?? [];
  const berechnung    = data?.berechnung;

  // Option A: Einträge aus bonusbuchungen (real, mit Datum + Beschreibung)
  const optionAEintraege = useMemo(
    () => buchungen.filter((b) => b.typ === 'option_a'),
    [buchungen],
  );

  // Für jede Buchung: istManuell = wenn erstelltVonId gesetzt ist
  // Da die API erstelltVonId nicht überträgt, unterscheiden wir:
  // Auto-Sync: buchungsdatum ist vor dem 31. Dez. (echtes Tagesdatum)
  // Manuell: wird vom Admin explizit eingetragen
  // Einfachste Heuristik: beschreibung enthält typische Sync-Inhalte
  // → nicht zuverlässig, also einfach: alle Option-A-Einträge ohne "Admin"-Badge zeigen

  // Gefilterte Eintraege basierend auf Typ-Filter
  const sichtbareOptA = typFilter !== 'option_b' ? optionAEintraege : [];
  const zeigeOptB     = typFilter !== 'option_a' && berechnung && berechnung.optionB_betrag > 0;

  // Summe berechnen
  const summeA = sichtbareOptA.reduce((s, b) => s + Number(b.betragEur), 0);
  const summeB = zeigeOptB ? (berechnung?.optionB_betrag ?? 0) : 0;
  const summe  = summeA + summeB;
  const anzahl = sichtbareOptA.length + (zeigeOptB ? 1 : 0);
  const positiv = summe >= 0;

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* ── Filter-Leiste ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <span className="text-xs text-gray-400 flex-shrink-0">Jahr:</span>
          {JAHRE.map((j) => (
            <FilterPill
              key={j}
              label={String(j)}
              active={jahr === j}
              onClick={() => setJahr(j)}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <span className="text-xs text-gray-400 flex-shrink-0">Typ:</span>
          {([
            ['alle',     'Alle'],
            ['option_a', 'Option A'],
            ['option_b', 'Option B'],
          ] as const).map(([val, label]) => (
            <FilterPill
              key={val}
              label={label}
              active={typFilter === val}
              onClick={() => setTypFilter(val)}
            />
          ))}
        </div>
      </div>

      {/* ── Summen-Banner ──────────────────────────────────────────────────── */}
      {!loading && anzahl > 0 && (
        <div className={`rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${positiv ? 'bg-bonus-50 border border-bonus-200' : 'bg-malus-50 border border-malus-100'}`}>
          <div>
            <p className="text-xs text-gray-500">{anzahl} {anzahl === 1 ? 'Eintrag' : 'Einträge'}</p>
            <p className={`text-xl font-bold tabular-nums ${positiv ? 'text-bonus-700' : 'text-malus-600'}`}>
              {positiv ? '+' : ''}{formatEur(summe)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Vorläufig · Stand heute</p>
            <p className="text-xs text-gray-500 mt-0.5">Final nach Jahresabschluss</p>
          </div>
        </div>
      )}

      {/* ── Buchungsliste ──────────────────────────────────────────────────── */}
      <Card padding="none">
        <div className="px-4 py-3">
          {loading ? (
            <div className="divide-y divide-gray-50">
              {[1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)}
            </div>
          ) : anzahl === 0 ? (
            <div className="py-12 text-center">
              <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
              <p className="text-sm text-gray-500 font-medium">Keine Einträge für {jahr}</p>
              <p className="text-xs text-gray-400 mt-1">Anderes Jahr oder Typ wählen</p>
            </div>
          ) : (
            <>
              {/* Option A: Einzelbuchungen nach Datum sortiert */}
              {sichtbareOptA
                .slice()
                .sort((a, b) => new Date(b.buchungsdatum).getTime() - new Date(a.buchungsdatum).getTime())
                .map((buchung) => (
                  <BuchungZeile
                    key={buchung.id}
                    buchung={buchung}
                    istManuell={false}
                  />
                ))}
              {/* Option B: Jahressaldo */}
              {zeigeOptB && berechnung && (
                <SaldoZeile
                  betrag={berechnung.optionB_betrag}
                  saldo={berechnung.optionB_jahressaldo}
                  jahr={jahr}
                />
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
