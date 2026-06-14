/**
 * StdAnzeige — Stundenanzeige im HH:MM-Format
 *
 * Primär:    "05:30"    (Stunden:Minuten)
 * Sekundär:  "(5,5 h)"  klein in Grau daneben
 *
 * Props:
 *   h        – Dezimalstunden (kann negativ sein)
 *   prefix   – optionales Vorzeichen '+' oder '−' (leer = kein Vorzeichen)
 *   inline   – wenn true, kein Zeilenumbruch (Standard: true)
 */

import { toHHMM, fmtNum } from '@/lib/fmt';

interface StdAnzeigeProps {
  h:        number;
  prefix?:  '' | '+' | '−' | '-';
  className?: string;
  stacked?: boolean;
}

export function StdAnzeige({ h, prefix = '', className = '', stacked = false }: StdAnzeigeProps) {
  const absH = Math.abs(h);
  const hhmm = toHHMM(absH);
  const dez  = fmtNum(absH, 1);

  if (stacked) {
    return (
      <span className={`tabular-nums inline-flex flex-col items-end leading-tight ${className}`}>
        <span>{prefix}{hhmm}</span>
        <span className="text-[10px] font-normal opacity-50">({dez})</span>
      </span>
    );
  }

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}{hhmm}
      <span className="ml-1 text-[10px] font-normal opacity-50 tabular-nums">({dez})</span>
    </span>
  );
}

/**
 * Hilfsfunktion: leitet das richtige Vorzeichen aus dem Wert ab.
 * Positiv → '+', Negativ → '−', Null → ''
 */
export function autoPrefix(h: number): '' | '+' | '−' {
  if (h > 0) return '+';
  if (h < 0) return '−';
  return '';
}
