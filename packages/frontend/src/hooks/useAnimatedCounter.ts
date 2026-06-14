/**
 * useAnimatedCounter — zählt von 0 auf den Zielwert hoch
 *
 * Verwendet requestAnimationFrame für flüssige 60fps-Animation.
 * Easing: easeOutExpo (beginnt schnell, verlangsamt sich am Ende)
 */

import { useState, useEffect, useRef } from 'react';

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

interface UseAnimatedCounterOptions {
  target:    number;
  duration?: number;   // ms, Standard: 1200
  decimals?: number;   // Nachkommastellen
  enabled?:  boolean;  // false = sofort Zielwert anzeigen
}

export function useAnimatedCounter({
  target,
  duration = 1200,
  decimals = 2,
  enabled  = true,
}: UseAnimatedCounterOptions): string {
  const [value, setValue] = useState(enabled ? 0 : target);
  const startTime = useRef<number | null>(null);
  const rafRef    = useRef<number | null>(null);
  const prevTarget = useRef<number>(target);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }

    // Neu starten wenn target sich ändert
    startTime.current  = null;
    const startValue   = prevTarget.current !== target ? 0 : value;
    prevTarget.current = target;

    function step(timestamp: number) {
      if (!startTime.current) startTime.current = timestamp;
      const elapsed  = timestamp - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = easeOutExpo(progress);

      setValue(startValue + (target - startValue) * eased);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setValue(target);
      }
    }

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, enabled]);

  return value.toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
