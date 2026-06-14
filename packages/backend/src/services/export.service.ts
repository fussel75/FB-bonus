/**
 * export.service.ts — Schritt 9
 *
 * PDF-Bericht (pdfkit):
 *   Seite 1:  Deckblatt — Firmenname, Titel, Jahr, Datum, Admin-Name
 *   Seite 2:  Zusammenfassung — Gesamtbetrag, Anzahl MA, Option A/B Split
 *   Seite 3+: Haupttabelle — je Mitarbeiter eine Zeile, automatisch paginiert
 *   Footer:   Seitenzahl | Datum | "Vertraulich"
 *
 * CSV (papaparse):
 *   Semikolon-getrennt, BOM-Header für korrekte Umlaute in Excel
 *   Spalten: Mitarbeiternummer, Vorname, Nachname, Rolle, Option_A_EUR,
 *            Option_B_EUR, Gesamt_EUR, IBAN, Verwendungszweck, Status
 */

import PDFDocument from 'pdfkit';
import Papa        from 'papaparse';
import ExcelJS     from 'exceljs';
import { prisma }  from '../db/client';
import { konfigService } from './konfiguration.service';

// ─── Farben (Flat Design, passend zur App) ───────────────────────────────────

const C = {
  schwarz:   '#111827',   // gray-900
  dunkel:    '#1f2937',   // gray-800
  mittel:    '#4b5563',   // gray-600
  hell:      '#9ca3af',   // gray-400
  rahmen:    '#e5e7eb',   // gray-200
  bg_leicht: '#f9fafb',   // gray-50
  bonus:     '#059669',   // emerald-600
  malus:     '#dc2626',   // red-600
  akzent:    '#1d4ed8',   // blue-700
  weiss:     '#ffffff',
};

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function eur(n: number): string {
  return new Intl.NumberFormat('de-DE', {
    style:    'currency',
    currency: 'EUR',
  }).format(n);
}

function datumHeute(): string {
  return new Date().toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

/** Konvertiert Buffer in Promise */
function docToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data',  (c: Buffer) => chunks.push(c));
    doc.on('end',   ()          => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// ─── Footer auf aktueller Seite ──────────────────────────────────────────────

// Bug 7 Fix: gesamtSeiten wurde immer als 0 übergeben (PDFKit kennt keine
// vorausschauende Gesamtseitenzahl). Statt "Seite X von 0" wird jetzt nur
// "Seite X" ausgegeben wenn gesamtSeiten unbekannt ist.
function drawFooter(
  doc:        PDFKit.PDFDocument,
  seite:      number,
  gesamtSeiten: number,
  erstelltAm: string,
): void {
  const y      = doc.page.height - 40;
  const left   = doc.page.margins.left;
  const right  = doc.page.width - doc.page.margins.right;
  const mitte  = doc.page.width / 2;

  const seitenText = gesamtSeiten > 0
    ? `Seite ${seite} von ${gesamtSeiten}`
    : `Seite ${seite}`;

  doc
    .moveTo(left, y - 8)
    .lineTo(right, y - 8)
    .strokeColor(C.rahmen)
    .lineWidth(0.5)
    .stroke();

  doc
    .fontSize(8)
    .fillColor(C.hell)
    .text(seitenText,    left,           y, { continued: false, align: 'left',   width: (right - left) / 3 })
    .text(erstelltAm,   mitte - 60,     y, { continued: false, align: 'center',  width: 120 })
    .text('Vertraulich', right - ((right - left) / 3), y, { continued: false, align: 'right', width: (right - left) / 3 });
}

// ─── Deckblatt (Seite 1) ──────────────────────────────────────────────────────

function drawDeckblatt(
  doc:         PDFKit.PDFDocument,
  firmenname:  string,
  kalenderjahr: number,
  adminName:   string,
  erstelltAm:  string,
): void {
  const w    = doc.page.width;
  const h    = doc.page.height;
  const ml   = doc.page.margins.left;

  // Farbiger Header-Balken oben
  doc
    .rect(0, 0, w, 180)
    .fill(C.dunkel);

  // Firmenname (oben, weiss)
  doc
    .fontSize(13)
    .fillColor(C.weiss)
    .text(firmenname, ml, 48, { align: 'left' });

  // Akzentlinie
  doc
    .rect(ml, 75, 48, 3)
    .fill(C.bonus);

  // Titel
  doc
    .fontSize(28)
    .fillColor(C.weiss)
    .text('Jahresabschluss-Bericht', ml, 92, { align: 'left' });

  // Jahr
  doc
    .fontSize(18)
    .fillColor('#9ca3af')
    .text(String(kalenderjahr), ml, 132, { align: 'left' });

  // Metadaten-Box in der Mitte der Seite
  const boxY = h / 2 - 60;
  const boxW = w - ml * 2;

  doc
    .rect(ml, boxY, boxW, 120)
    .fill(C.bg_leicht)
    .rect(ml, boxY, 4, 120)
    .fill(C.akzent);

  doc
    .fontSize(10)
    .fillColor(C.hell)
    .text('ERSTELLUNGSDATUM', ml + 24, boxY + 24)
    .fontSize(14)
    .fillColor(C.dunkel)
    .text(erstelltAm, ml + 24, boxY + 40)
    .fontSize(10)
    .fillColor(C.hell)
    .text('ERSTELLT VON', ml + 24, boxY + 72)
    .fontSize(14)
    .fillColor(C.dunkel)
    .text(adminName, ml + 24, boxY + 88);

  // Vertraulich-Hinweis am Ende der Seite
  doc
    .fontSize(9)
    .fillColor(C.hell)
    .text(
      'Dieses Dokument enthält vertrauliche Vergütungsinformationen und ist ausschließlich für den internen Gebrauch bestimmt.',
      ml,
      h - 80,
      { align: 'center', width: boxW },
    );
}

// ─── Zusammenfassung (Seite 2) ───────────────────────────────────────────────

function drawZusammenfassung(
  doc:          PDFKit.PDFDocument,
  kalenderjahr: number,
  daten: {
    gesamtTopf:          number;
    topfA:               number;
    topfB:               number;
    anzahlMitarbeiter:   number;
    anzahlQualifiziert:  number;
  },
  erstelltAm: string,
): void {
  const ml   = doc.page.margins.left;
  const mr   = doc.page.margins.right;
  const w    = doc.page.width - ml - mr;

  // Seitentitel
  doc
    .fontSize(20)
    .fillColor(C.dunkel)
    .text('Zusammenfassung', ml, doc.page.margins.top);

  doc
    .rect(ml, doc.page.margins.top + 28, 40, 2.5)
    .fill(C.bonus);

  doc
    .fontSize(10)
    .fillColor(C.hell)
    .text(`Jahresabschluss ${kalenderjahr}`, ml, doc.page.margins.top + 38);

  // KPI-Karten
  const kartenY  = doc.page.margins.top + 68;
  const kartenW  = (w - 24) / 2;
  const kartenH  = 80;

  const karten = [
    { label: 'GESAMTTOPF',                wert: eur(daten.gesamtTopf),           farbe: C.bonus  },
    { label: 'QUALIFIZIERTE MITARBEITER', wert: `${daten.anzahlQualifiziert} / ${daten.anzahlMitarbeiter}`, farbe: C.akzent },
    { label: 'OPTION A (Zusatzstunden)',  wert: eur(daten.topfA),                farbe: C.dunkel },
    { label: 'OPTION B (Projekteffizienz)', wert: eur(daten.topfB),              farbe: C.dunkel },
  ];

  karten.forEach((k, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x   = ml + col * (kartenW + 24);
    const y   = kartenY + row * (kartenH + 16);

    doc
      .rect(x, y, kartenW, kartenH)
      .fill(C.bg_leicht);

    doc
      .rect(x, y, 4, kartenH)
      .fill(k.farbe);

    doc
      .fontSize(8)
      .fillColor(C.hell)
      .text(k.label, x + 16, y + 16)
      .fontSize(20)
      .fillColor(C.dunkel)
      .text(k.wert, x + 16, y + 32);
  });

  // Erläuterungstext
  const textY = kartenY + 2 * (kartenH + 16) + 24;

  doc
    .fontSize(10)
    .fillColor(C.dunkel)
    .text('Berechnungsgrundlage', ml, textY)
    .moveDown(0.4)
    .fontSize(9)
    .fillColor(C.mittel)
    .text(
      'Option A (Zusatzstunden): Summe aller manuell gebuchten Zusatzstunden × Stundensatz Option A.\n' +
      'Option B (Projekteffizienz): MAX(0, Projektsaldo) × Rollenfaktor-Anteil × Stundensatz Option B.\n' +
      'Qualifizierung: Mitarbeiter mit Kranktagen über dem Schwellenwert oder unzureichender ' +
      'Betriebszugehörigkeit sind nicht qualifiziert und erhalten keine Auszahlung.',
      { width: w },
    );

  drawFooter(doc, 2, 0, erstelltAm); // Gesamtseitenzahl wird nachträglich nicht gesetzt (pdfkit-Limitierung)
}

// ─── Haupttabelle (Seite 3+) ─────────────────────────────────────────────────

interface TabellenZeile {
  nr:                  number;
  vorname:             string;
  nachname:            string;
  rolle:               string;
  optionA:             number;
  optionB:             number;
  gesamt:              number;
  qualifiziert:        boolean;
  praeferenz:          string;
  kranktage:           number;
  krankenFaktorProz:   number;
  krankenKuerzungEur:  number;
  betragBrutto:        number;
}

function drawTabelle(
  doc:        PDFKit.PDFDocument,
  zeilen:     TabellenZeile[],
  startSeite: number,
  erstelltAm: string,
): number {
  const ml       = doc.page.margins.left;
  const mr       = doc.page.margins.right;
  const w        = doc.page.width - ml - mr;
  const pageH    = doc.page.height;
  const footerY  = pageH - doc.page.margins.bottom - 24;
  const ZEILENHOEHE = 22;
  const KOPFHOEHE   = 28;

  // Spaltenbreiten
  const COLS = {
    nr:       28,
    name:     130,
    rolle:    80,
    optionA:  70,
    optionB:  70,
    gesamt:   78,
    status:   52,
    praef:    48,
  };

  let aktuelleSeite = startSeite;
  let y = doc.page.margins.top;
  const ZEILENHOEHE_KRANK = 12; // Zusatz-Zeilenhöhe für Kürzungs-Hinweis

  // Seitentitel
  doc
    .fontSize(20)
    .fillColor(C.dunkel)
    .text('Auszahlungsübersicht', ml, y);

  doc.rect(ml, y + 28, 44, 2.5).fill(C.bonus);

  doc
    .fontSize(10)
    .fillColor(C.hell)
    .text('Alle Mitarbeiter', ml, y + 38);

  y += 64;

  // Tabellenkopf zeichnen
  const drawKopf = (yPos: number) => {
    doc.rect(ml, yPos, w, KOPFHOEHE).fill(C.dunkel);

    const headers = [
      { text: '#',          x: ml + 8,                             w: COLS.nr     },
      { text: 'Name',       x: ml + COLS.nr + 8,                   w: COLS.name   },
      { text: 'Rolle',      x: ml + COLS.nr + COLS.name + 8,       w: COLS.rolle  },
      { text: 'Option A',   x: ml + COLS.nr + COLS.name + COLS.rolle + 8, w: COLS.optionA },
      { text: 'Option B',   x: ml + COLS.nr + COLS.name + COLS.rolle + COLS.optionA + 8, w: COLS.optionB },
      { text: 'Gesamt',     x: ml + COLS.nr + COLS.name + COLS.rolle + COLS.optionA + COLS.optionB + 8, w: COLS.gesamt },
      { text: 'Status',     x: ml + COLS.nr + COLS.name + COLS.rolle + COLS.optionA + COLS.optionB + COLS.gesamt + 8, w: COLS.status },
      { text: 'Präf.',      x: ml + COLS.nr + COLS.name + COLS.rolle + COLS.optionA + COLS.optionB + COLS.gesamt + COLS.status + 8, w: COLS.praef },
    ];

    headers.forEach((h) => {
      doc
        .fontSize(8)
        .fillColor(C.weiss)
        .text(h.text, h.x, yPos + 10, { width: h.w, align: 'left' });
    });

    return yPos + KOPFHOEHE;
  };

  y = drawKopf(y);

  // Zeilen zeichnen
  zeilen.forEach((zeile, idx) => {
    const hatKuerzung = zeile.qualifiziert && zeile.krankenKuerzungEur > 0;
    const zeilenHoehe = ZEILENHOEHE + (hatKuerzung ? ZEILENHOEHE_KRANK : 0);

    // Neue Seite falls kein Platz mehr
    if (y + zeilenHoehe > footerY - 24) {
      drawFooter(doc, aktuelleSeite, 0, erstelltAm);
      doc.addPage();
      aktuelleSeite++;
      y = doc.page.margins.top;
      y = drawKopf(y); // Kopf auf neuer Seite wiederholen
    }

    // Hintergrund alternierend
    if (idx % 2 === 0) {
      doc.rect(ml, y, w, zeilenHoehe).fill(zeile.qualifiziert ? C.bg_leicht : '#fef2f2');
    }

    // Farbstreifen links (bonus/malus)
    doc
      .rect(ml, y, 3, zeilenHoehe)
      .fill(zeile.qualifiziert ? C.bonus : C.malus);

    const textY = y + 7;
    let xPos = ml + 8;

    doc.fontSize(8).fillColor(zeile.qualifiziert ? C.dunkel : C.malus);

    // Nr
    doc.text(String(zeile.nr), xPos, textY, { width: COLS.nr });
    xPos += COLS.nr;

    // Name
    const name = `${zeile.nachname}, ${zeile.vorname}`;
    doc.text(name.length > 22 ? name.slice(0, 20) + '…' : name, xPos, textY, { width: COLS.name });
    xPos += COLS.name;

    // Rolle
    doc.text(zeile.rolle, xPos, textY, { width: COLS.rolle });
    xPos += COLS.rolle;

    // Option A
    doc.text(eur(zeile.optionA), xPos, textY, { width: COLS.optionA - 4, align: 'right' });
    xPos += COLS.optionA;

    // Option B
    doc.text(eur(zeile.optionB), xPos, textY, { width: COLS.optionB - 4, align: 'right' });
    xPos += COLS.optionB;

    // Gesamt (fett / grün wenn qualifiziert)
    doc
      .fillColor(zeile.qualifiziert ? C.bonus : C.malus)
      .text(eur(zeile.gesamt), xPos, textY, { width: COLS.gesamt - 4, align: 'right' });
    xPos += COLS.gesamt;

    // Status
    doc
      .fillColor(zeile.qualifiziert ? C.bonus : C.malus)
      .text(zeile.qualifiziert ? 'qualif.' : 'nicht qual.', xPos, textY, { width: COLS.status });
    xPos += COLS.status;

    // Präferenz
    doc
      .fillColor(C.mittel)
      .text(zeile.praeferenz === 'geld' ? 'Geld' : 'Freizeit', xPos, textY, { width: COLS.praef });

    // Kranken-Kürzungs-Zeile (Audit-Trail im PDF)
    if (hatKuerzung) {
      const krankenTextY = y + ZEILENHOEHE + 2;
      const hinweisX = ml + COLS.nr + 8;
      const hinweis  = `Krankheits-Kürzung: ${zeile.kranktage} Tage · Faktor ${zeile.krankenFaktorProz.toLocaleString('de-DE', { maximumFractionDigits: 0 })} %`
        + ` · Brutto ${eur(zeile.betragBrutto)} − ${eur(zeile.krankenKuerzungEur)} (§ 4a EFZG)`;
      doc
        .fontSize(7)
        .fillColor(C.hell)
        .text(hinweis, hinweisX, krankenTextY, { width: w - COLS.nr - 16, lineBreak: false });
    }

    // Trennlinie
    doc
      .moveTo(ml, y + zeilenHoehe)
      .lineTo(ml + w, y + zeilenHoehe)
      .strokeColor(C.rahmen)
      .lineWidth(0.3)
      .stroke();

    y += zeilenHoehe;
  });

  // Summenzeile
  if (y + 32 <= footerY - 24) {
    doc.rect(ml, y, w, 32).fill(C.dunkel);

    const sumA = zeilen.reduce((s, z) => s + (z.qualifiziert ? z.optionA : 0), 0);
    const sumB = zeilen.reduce((s, z) => s + (z.qualifiziert ? z.optionB : 0), 0);
    const sumG = zeilen.reduce((s, z) => s + (z.qualifiziert ? z.gesamt  : 0), 0);

    const sumX_A = ml + COLS.nr + COLS.name + COLS.rolle;
    const sumX_B = sumX_A + COLS.optionA;
    const sumX_G = sumX_B + COLS.optionB;

    doc.fontSize(9).fillColor(C.weiss);
    doc.text('SUMME (qualifizierte MA)',    ml + 8,          y + 11, { width: COLS.nr + COLS.name + COLS.rolle - 8 });
    doc.text(eur(sumA),                    sumX_A,           y + 11, { width: COLS.optionA - 4, align: 'right' });
    doc.text(eur(sumB),                    sumX_B,           y + 11, { width: COLS.optionB - 4, align: 'right' });
    doc.fillColor(C.bonus).text(eur(sumG), sumX_G,           y + 11, { width: COLS.gesamt - 4,  align: 'right' });
  }

  return aktuelleSeite;
}

// ─── Export-Service ───────────────────────────────────────────────────────────

export const exportService = {

  async jahresabschlussExport(
    jahr:    number,
    format:  'pdf' | 'csv' | 'xlsx',
    adminId?: number,
  ): Promise<Buffer> {

    // ── Daten laden ──────────────────────────────────────────────────────────
    const konfig = await konfigService.alleWerte();
    const firmenname = String(konfig.unternehmensname ?? 'Unternehmen');

    const auszahlungen = await prisma.auszahlung.findMany({
      where:   { kalenderjahr: jahr },
      include: {
        mitarbeiter: { include: { rolle: true } },
      },
      orderBy: [{ mitarbeiter: { nachname: 'asc' } }],
    });

    // Admin-Name
    let adminName = 'System';
    if (adminId) {
      const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
      if (admin) adminName = admin.name;
    }

    const erstelltAm = datumHeute();

    // ── CSV ──────────────────────────────────────────────────────────────────
    if (format === 'csv') {
      const rows = auszahlungen.map((a) => ({
        Mitarbeiternummer:    a.mitarbeiterId,
        Vorname:              a.mitarbeiter.vorname,
        Nachname:             a.mitarbeiter.nachname,
        Rolle:                a.mitarbeiter.rolle.bezeichnung,
        Brutto_EUR:           Number(a.betragBrutto).toFixed(2).replace('.', ','),
        Krankheitstage:       a.kranktage,
        Kranken_Faktor_Proz:  Number(a.krankenFaktorProzent).toFixed(2).replace('.', ','),
        Kranken_Kuerzung_EUR: Number(a.krankenKuerzungEur).toFixed(2).replace('.', ','),
        Option_A_EUR:         Number(a.betragOptionA).toFixed(2).replace('.', ','),
        Option_B_EUR:         Number(a.betragOptionB).toFixed(2).replace('.', ','),
        Gesamt_EUR:           Number(a.betragGesamt).toFixed(2).replace('.', ','),
        IBAN:                 '',   // Manuell zu füllen
        Verwendungszweck:     `Jahresbonus ${jahr}`,
        Status:               a.status,
      }));

      // papaparse: semikolon-getrennt, kein automatisches BOM
      // escapeFormulae schützt vor CSV-Formula-Injection (=, +, -, @)
      const csv = Papa.unparse(rows, {
        delimiter:      ';',
        header:         true,
        newline:        '\r\n',   // Windows-Zeilenumbruch für Excel
        escapeFormulae: true,
      });

      // BOM (Byte Order Mark) voranstellen → Umlaute in Excel korrekt
      const BOM = '\uFEFF';
      return Buffer.from(BOM + csv, 'utf-8');
    }

    // ── XLSX (Excel) ─────────────────────────────────────────────────────────
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      wb.creator = adminName;
      wb.created = new Date();
      wb.title = `Jahresabschluss ${jahr}`;

      const ws = wb.addWorksheet(`Bonus ${jahr}`);
      ws.columns = [
        { header: 'Nr',                  key: 'nr',          width: 5 },
        { header: 'Personalnummer',      key: 'pn',          width: 15 },
        { header: 'Vorname',             key: 'vn',          width: 15 },
        { header: 'Nachname',            key: 'nn',          width: 18 },
        { header: 'Rolle',               key: 'rolle',       width: 18 },
        { header: 'Kranktage',           key: 'kranktage',   width: 11 },
        { header: 'Kranken-Faktor (%)',  key: 'kfaktor',     width: 18 },
        { header: 'Brutto (€)',          key: 'brutto',      width: 12 },
        { header: 'Kürzung (€)',         key: 'kuerzung',    width: 13 },
        { header: 'Option A (€)',        key: 'optA',        width: 12 },
        { header: 'Option B (€)',        key: 'optB',        width: 12 },
        { header: 'Gesamt (€)',          key: 'gesamt',      width: 13 },
        { header: 'Status',              key: 'status',      width: 12 },
        { header: 'Präferenz',           key: 'praef',       width: 11 },
      ];
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

      auszahlungen.forEach((a, idx) => {
        ws.addRow({
          nr:        idx + 1,
          pn:        a.mitarbeiter.personalNummer ?? '',
          vn:        a.mitarbeiter.vorname,
          nn:        a.mitarbeiter.nachname,
          rolle:     a.mitarbeiter.rolle.bezeichnung,
          kranktage: a.kranktage,
          kfaktor:   Number(a.krankenFaktorProzent),
          brutto:    Number(a.betragBrutto),
          kuerzung:  Number(a.krankenKuerzungEur),
          optA:      Number(a.betragOptionA),
          optB:      Number(a.betragOptionB),
          gesamt:    Number(a.betragGesamt),
          status:    a.status,
          praef:     a.mitarbeiter.auszahlungspraeferenz,
        });
      });

      // Summenzeile
      const summenRow = ws.addRow({
        vn: 'SUMME',
        brutto:   auszahlungen.reduce((s, a) => s + Number(a.betragBrutto),   0),
        kuerzung: auszahlungen.reduce((s, a) => s + Number(a.krankenKuerzungEur), 0),
        optA:     auszahlungen.reduce((s, a) => s + Number(a.betragOptionA),  0),
        optB:     auszahlungen.reduce((s, a) => s + Number(a.betragOptionB),  0),
        gesamt:   auszahlungen.reduce((s, a) => s + Number(a.betragGesamt),   0),
      });
      summenRow.font = { bold: true };
      summenRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

      ['brutto', 'kuerzung', 'optA', 'optB', 'gesamt'].forEach((key) => {
        const col = ws.getColumn(key);
        col.numFmt = '#,##0.00 €';
      });

      // Freiwilligkeitsvorbehalt — gesetzlich relevanter Hinweis
      ws.addRow([]);
      const hinweisRow = ws.addRow([
        'Hinweis: Diese Bonuszahlungen erfolgen freiwillig. Ein Rechtsanspruch auf zukünftige Zahlungen, auch bei wiederholter Gewährung, besteht nicht.',
      ]);
      hinweisRow.font = { italic: true, color: { argb: 'FF6B7280' } };
      ws.mergeCells(`A${hinweisRow.number}:N${hinweisRow.number}`);

      const buffer = await wb.xlsx.writeBuffer();
      return Buffer.from(buffer);
    }

    // ── PDF ───────────────────────────────────────────────────────────────────
    const doc = new PDFDocument({
      size:    'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title:    `Jahresabschluss-Bericht ${jahr}`,
        Author:   adminName,
        Subject:  'BonusTrack Jahresabschluss',
        Creator:  'BonusTrack',
      },
    });

    const bufferPromise = docToBuffer(doc);

    // KPIs für Zusammenfassung
    const qualifiziert = auszahlungen.filter((a) => a.status !== 'storniert');
    const gesamtTopf   = qualifiziert.reduce((s, a) => s + Number(a.betragGesamt),  0);
    const topfA        = qualifiziert.reduce((s, a) => s + Number(a.betragOptionA), 0);
    const topfB        = qualifiziert.reduce((s, a) => s + Number(a.betragOptionB), 0);

    // Seite 1: Deckblatt
    drawDeckblatt(doc, firmenname, jahr, adminName, erstelltAm);
    drawFooter(doc, 1, 0, erstelltAm);

    // Seite 2: Zusammenfassung
    doc.addPage();
    drawZusammenfassung(doc, jahr, {
      gesamtTopf,
      topfA,
      topfB,
      anzahlMitarbeiter:  auszahlungen.length,
      anzahlQualifiziert: qualifiziert.length,
    }, erstelltAm);

    // Seite 3+: Haupttabelle
    doc.addPage();
    const zeilen: TabellenZeile[] = auszahlungen.map((a, idx) => ({
      nr:                 idx + 1,
      vorname:            a.mitarbeiter.vorname,
      nachname:           a.mitarbeiter.nachname,
      rolle:              a.mitarbeiter.rolle.bezeichnung,
      optionA:            Number(a.betragOptionA),
      optionB:            Number(a.betragOptionB),
      gesamt:             Number(a.betragGesamt),
      qualifiziert:       a.status !== 'storniert',
      praeferenz:         a.mitarbeiter.auszahlungspraeferenz,
      kranktage:          a.kranktage,
      krankenFaktorProz:  Number(a.krankenFaktorProzent),
      krankenKuerzungEur: Number(a.krankenKuerzungEur),
      betragBrutto:       Number(a.betragBrutto),
    }));

    const letzteSeite = drawTabelle(doc, zeilen, 3, erstelltAm);
    drawFooter(doc, letzteSeite, 0, erstelltAm);

    doc.end();
    return bufferPromise;
  },

  async prognoseExport(_jahr: number): Promise<Buffer> {
    // Stub — vollständige Implementierung optional in Schritt 10+
    return Buffer.from('Prognose-Export: siehe Jahresabschluss-PDF', 'utf-8');
  },
};
