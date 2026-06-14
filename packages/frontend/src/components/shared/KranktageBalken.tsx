/**
 * KranktageBalken — Kranktage-Fortschrittsbalken mit Farbwechsel
 *
 *  0–64%:  Grün  (sicher im Bereich)
 * 65–89%:  Amber (Warnbereich)
 * 90–100%: Rot   (Schwellenwert beinahe/bereits erreicht)
 *
 * Über 100%: Rot + Badge "Anspruch verfallen"
 */

import { ProgressBar } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';

interface KranktageBalkenProps {
  kranktage:        number;
  schwellenwert:    number;
  showNumbers?:     boolean;
  className?:       string;
}

function resolveVariant(pct: number): 'bonus' | 'grenz' | 'malus' {
  if (pct >= 90) return 'malus';
  if (pct >= 65) return 'grenz';
  return 'bonus';
}

function resolveStatusText(pct: number, kranktage: number, schwellenwert: number): string {
  if (kranktage > schwellenwert) return 'Schwellenwert überschritten';
  if (pct >= 90)  return `Noch ${schwellenwert - kranktage} Tag${schwellenwert - kranktage !== 1 ? 'e' : ''} verbleibend`;
  if (pct >= 65)  return 'Achtung: Grenzbereich';
  return 'Im sicheren Bereich';
}

export function KranktageBalken({
  kranktage,
  schwellenwert,
  showNumbers = true,
  className   = '',
}: KranktageBalkenProps) {
  const pct        = (kranktage / schwellenwert) * 100;
  const variant    = resolveVariant(pct);
  const statusText = resolveStatusText(pct, kranktage, schwellenwert);
  const verfallen  = kranktage > schwellenwert;

  const badgeVariantMap = { bonus: 'bonus', grenz: 'grenz', malus: 'malus' } as const;

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header-Zeile */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-600">Kranktage</span>
        <div className="flex items-center gap-2">
          {showNumbers && (
            <span className="text-xs text-gray-500 tabular-nums">
              {kranktage} / {schwellenwert} Tage
            </span>
          )}
          <Badge variant={badgeVariantMap[variant]} dot>
            {statusText}
          </Badge>
        </div>
      </div>

      {/* Balken */}
      <ProgressBar
        value={kranktage}
        max={schwellenwert}
        variant="auto"
        size="md"
        animated
      />

      {/* Verfallen-Hinweis */}
      {verfallen && (
        <p className="text-xs text-malus-600 font-medium flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
          </svg>
          Bonusanspruch für dieses Jahr verfallen
        </p>
      )}
    </div>
  );
}
