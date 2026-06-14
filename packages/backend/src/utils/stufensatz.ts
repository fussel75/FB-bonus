/**
 * Gestaffelte Berechnung des Option-B-Betrags.
 *
 * Beispiel (Standard): bis 20 h → 30 €/h | bis 40 h → 20 €/h | darüber → 15 €/h
 *   50 h → 20×30 + 20×20 + 10×15 = 1.150 €
 */
export function stufenBetrag(
  stunden:  number,
  s1bis:    number,
  s1satz:   number,
  s2bis:    number,
  s2satz:   number,
  s3satz:   number,
): number {
  if (stunden <= 0) return 0;

  // Plausibilitätsprüfung: Stufen müssen aufsteigend sein.
  // Ungültige Konfiguration (s2bis <= s1bis) würde negative Zwischen-Beträge erzeugen.
  if (s2bis <= s1bis) {
    console.warn(
      `[Stufensatz] Ungültige Konfiguration: Stufe-2-Bis (${s2bis}) ≤ Stufe-1-Bis (${s1bis}). ` +
      `Alle Stunden werden mit Stufe-1-Satz (${s1satz} €/h) berechnet.`,
    );
    return stunden * s1satz;
  }

  let betrag = 0;

  const s1Stunden = Math.min(stunden, s1bis);
  betrag += s1Stunden * s1satz;

  if (stunden > s1bis) {
    const s2Stunden = Math.min(stunden - s1bis, s2bis - s1bis);
    betrag += s2Stunden * s2satz;
  }

  if (stunden > s2bis) {
    betrag += (stunden - s2bis) * s3satz;
  }

  return betrag;
}

export interface StufenKonfig {
  s1bis:  number;
  s1satz: number;
  s2bis:  number;
  s2satz: number;
  s3satz: number;
}

export function ladeStufenKonfig(konfig: Record<string, string | number | boolean>): StufenKonfig {
  return {
    s1bis:  Number(konfig.stundensatzb_stufe1_bis)  || 20,
    s1satz: Number(konfig.stundensatzb_stufe1_satz) || 30,
    s2bis:  Number(konfig.stundensatzb_stufe2_bis)  || 40,
    s2satz: Number(konfig.stundensatzb_stufe2_satz) || 20,
    s3satz: Number(konfig.stundensatzb_stufe3_satz) || 15,
  };
}
