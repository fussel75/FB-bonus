/**
 * AnimatedCounter — animierter €-Zähler für den Hero-Bereich
 */

import { useAnimatedCounter } from '@/hooks/useAnimatedCounter';

interface AnimatedCounterProps {
  value:      number;
  prefix?:    string;
  suffix?:    string;
  duration?:  number;
  decimals?:  number;
  className?: string;
  enabled?:   boolean;
}

export function AnimatedCounter({
  value,
  prefix    = '',
  suffix    = ' €',
  duration  = 1400,
  decimals  = 2,
  className = '',
  enabled   = true,
}: AnimatedCounterProps) {
  const display = useAnimatedCounter({ target: value, duration, decimals, enabled });

  return (
    <span className={className}>
      {prefix}{display}{suffix}
    </span>
  );
}

// Hero-Variante: große animierte Zahl
export function HeroCounter({
  value,
  loading = false,
  className = '',
}: {
  value:     number;
  loading?:  boolean;
  className?: string;
}) {
  const display = useAnimatedCounter({
    target:   value,
    duration: 1600,
    decimals: 2,
    enabled:  !loading,
  });

  if (loading) {
    return (
      <div className={`h-14 w-56 rounded-lg bg-gradient-to-r from-white/20 via-white/40 to-white/20 bg-[length:200%_100%] animate-shimmer ${className}`} />
    );
  }

  return (
    <div className={`flex items-baseline gap-1 ${className}`}>
      <span className="text-5xl sm:text-6xl font-bold tabular-nums tracking-tight">
        {display}
      </span>
      <span className="text-2xl font-semibold opacity-80">€</span>
    </div>
  );
}
