import { useEffect, useState } from 'react';
import { apiClient } from '@/api/client';

interface TrendEntry {
  jahr:     number;
  gesamt:   number;
  brutto:   number;
  kuerzung: number;
  optionA:  number;
  optionB:  number;
  ausgezahlt: boolean;
  storniert:  boolean;
}

function fmtEur(n: number) {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

export function BonusTrend({ mitarbeiterId }: { mitarbeiterId: number }) {
  const [trend, setTrend] = useState<TrendEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<{ success: boolean; data: TrendEntry[] }>(`/admin/trend/${mitarbeiterId}`)
      .then((r) => setTrend(r.data.data))
      .catch(() => setError('Trend konnte nicht geladen werden'));
  }, [mitarbeiterId]);

  if (error) return <p className="text-xs text-malus-600">{error}</p>;
  if (!trend) return <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse_soft" />;
  if (trend.length === 0) return (
    <p className="text-xs text-gray-400 dark:text-gray-500 italic">Noch keine historischen Auszahlungen</p>
  );

  const max = Math.max(...trend.map((t) => t.gesamt), 1);

  return (
    <div className="space-y-3">
      {/* Sparkline-Chart */}
      <div className="flex items-end gap-2 h-20 px-1">
        {trend.map((t) => {
          const heightPct = (t.gesamt / max) * 100;
          return (
            <div key={t.jahr} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="flex-1 flex flex-col justify-end w-full">
                <div
                  className={`w-full rounded-t transition-all ${
                    t.storniert ? 'bg-malus-400/30'
                    : t.ausgezahlt ? 'bg-bonus-500'
                    : 'bg-info-400'
                  }`}
                  style={{ height: `${heightPct}%`, minHeight: t.gesamt > 0 ? '3px' : '1px' }}
                  title={`${t.jahr}: ${fmtEur(t.gesamt)}${t.kuerzung > 0 ? ` (Brutto ${fmtEur(t.brutto)}, Kürzung −${fmtEur(t.kuerzung)})` : ''}`}
                />
              </div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{t.jahr}</span>
            </div>
          );
        })}
      </div>

      {/* Werte tabellarisch */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        {trend.slice(-3).map((t) => (
          <div key={t.jahr} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
            <div className="text-gray-500 dark:text-gray-400">{t.jahr}</div>
            <div className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
              {fmtEur(t.gesamt)}
            </div>
            {t.kuerzung > 0 && (
              <div className="text-[10px] text-malus-600 dark:text-malus-400 tabular-nums">
                Brutto {fmtEur(t.brutto)} · −{fmtEur(t.kuerzung)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
