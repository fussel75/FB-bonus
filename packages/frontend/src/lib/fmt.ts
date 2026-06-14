/**
 * Einheitliche Zahlenformatierung in deutschem Format (de-DE).
 * Komma als Dezimaltrennzeichen, Punkt als Tausendertrenner.
 */

export function fmtNum(n: number, frac = 2): string {
  return n.toLocaleString('de-DE', {
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  });
}

/**
 * Dezimalstunden in HH:MM umwandeln.
 * 5.5 → "05:30"
 */
export function toHHMM(h: number): string {
  const absH     = Math.abs(h);
  const totalMin = Math.round(absH * 60);
  const std      = Math.floor(totalMin / 60);
  const min      = totalMin % 60;
  return `${String(std).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Dezimalstunden-String: "5,5 h" */
export function fmtHDez(h: number, frac = 1): string {
  return fmtNum(Math.abs(h), frac) + ' h';
}

/** Primärformat HH:MM (für Strings / Template-Literale) */
export function fmtH(n: number): string {
  return toHHMM(Math.abs(n));
}

export function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export function fmtFaktor(n: number): string {
  return '×' + fmtNum(n, 1);
}

export function fmtProzent(n: number, frac = 1): string {
  return fmtNum(n, frac) + ' %';
}
