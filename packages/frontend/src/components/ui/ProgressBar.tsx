interface ProgressBarProps {
  value:           number;   // 0–100
  max?:            number;
  variant?:        'bonus' | 'malus' | 'grenz' | 'info' | 'auto';
  size?:           'sm' | 'md' | 'lg';
  showLabel?:      boolean;
  label?:          string;
  className?:      string;
  animated?:       boolean;
  schwelleProzent?: number;  // optionale Schwellenwert-Markierung (0–100)
}

const variantTrack: Record<string, string> = {
  bonus: 'bg-bonus-100',
  malus: 'bg-malus-100',
  grenz: 'bg-grenz-100',
  info:  'bg-info-100',
};

const variantFill: Record<string, string> = {
  bonus: 'bg-bonus-500',
  malus: 'bg-malus-500',
  grenz: 'bg-grenz-500',
  info:  'bg-info-500',
};

const sizeClasses = {
  sm:  'h-1.5',
  md:  'h-2.5',
  lg:  'h-3.5',
};

// Automatische Farbe basierend auf Prozentwert (für Kranktage-Balken)
function autoVariant(pct: number): string {
  if (pct >= 90) return 'malus';
  if (pct >= 65) return 'grenz';
  return 'bonus';
}

export function ProgressBar({
  value,
  max            = 100,
  variant        = 'info',
  size           = 'md',
  showLabel      = false,
  label,
  className      = '',
  animated       = true,
  schwelleProzent,
}: ProgressBarProps) {
  const pct             = Math.min(Math.max((value / max) * 100, 0), 100);
  const resolvedVariant = variant === 'auto' ? autoVariant(pct) : variant;
  const showMarker      = schwelleProzent !== undefined && schwelleProzent > 0 && schwelleProzent < 100;

  return (
    <div className={`w-full ${className}`}>
      {(showLabel || label) && (
        <div className="flex justify-between items-center mb-1.5 text-xs text-gray-500">
          <span>{label ?? 'Fortschritt'}</span>
          <span className="font-medium">{Math.round(pct)}%</span>
        </div>
      )}
      <div className="relative w-full">
        <div className={`w-full rounded-full overflow-hidden ${variantTrack[resolvedVariant] ?? 'bg-gray-100'} ${sizeClasses[size]}`}>
          <div
            className={[
              'h-full rounded-full',
              variantFill[resolvedVariant] ?? 'bg-info-500',
              animated ? 'transition-[width] duration-700 ease-out' : '',
            ].join(' ')}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={max}
          />
        </div>
        {showMarker && (
          <div
            className={`absolute top-0 ${sizeClasses[size]} w-px bg-gray-500 opacity-50 pointer-events-none`}
            style={{ left: `${schwelleProzent}%` }}
            title={`Schwelle: ${schwelleProzent} %`}
          />
        )}
      </div>
    </div>
  );
}
