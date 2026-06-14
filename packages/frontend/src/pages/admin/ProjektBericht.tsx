/**
 * Admin — Projektbericht (Druckansicht / PDF-Export)
 *
 * Eigenständige Seite ohne AppShell-Sidebar.
 * Öffnet window.print() automatisch nach dem Laden.
 * URL: /admin/projekte/:id/bericht
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getProjektDetail, type ProjektMitStunden } from '@/api/admin';
import { toHHMM } from '@/lib/fmt';
import { autoPrefix } from '@/components/ui/StdAnzeige';

// ─── Kleine Print-Hilfsfunktionen ─────────────────────────────────────────────

function fmtDez(h: number) {
  return h.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtProzent(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'aktiv'         ? '#16a34a' :
    status === 'abgeschlossen' ? '#6b7280' : '#d97706';
  return (
    <span style={{
      display:       'inline-block',
      padding:       '1px 8px',
      borderRadius:  '9999px',
      fontSize:      '11px',
      fontWeight:    600,
      color:         '#fff',
      backgroundColor: color,
      letterSpacing: '0.02em',
    }}>
      {status}
    </span>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function ProjektBericht() {
  const { id }                      = useParams<{ id: string }>();
  const [detail, setDetail]         = useState<ProjektMitStunden | null>(null);
  const [loading, setLoading]       = useState(true);
  const [fehler, setFehler]         = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getProjektDetail(Number(id))
      .then(setDetail)
      .catch(() => setFehler('Projektdaten konnten nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, [id]);

  // Auto-Print nach dem Laden
  useEffect(() => {
    if (detail) {
      const timer = setTimeout(() => window.print(), 600);
      return () => clearTimeout(timer);
    }
  }, [detail]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#6b7280' }}>
        Lade Projektdaten …
      </div>
    );
  }

  if (fehler || !detail) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#dc2626' }}>
        {fehler ?? 'Projekt nicht gefunden.'}
      </div>
    );
  }

  // ─── Berechnungen ───────────────────────────────────────────────────────────

  const saldo = Number(detail.sollStunden) - Number(detail.istStundenGesamt);
  const proz  = Number(detail.sollStunden) > 0
    ? Math.min(100, Math.round((Number(detail.istStundenGesamt) / Number(detail.sollStunden)) * 100))
    : 0;

  type PmEntry = ProjektMitStunden['mitarbeiterStunden'][0];
  const grouped = new Map<number, { pm: PmEntry; istStunden: number }>();
  for (const pm of detail.mitarbeiterStunden) {
    const mid = pm.mitarbeiterId;
    if (grouped.has(mid)) {
      grouped.get(mid)!.istStunden += Number(pm.istStunden);
    } else {
      grouped.set(mid, { pm, istStunden: Number(pm.istStunden) });
    }
  }
  const mitMitPunkte = Array.from(grouped.values()).map(({ pm, istStunden }) => {
    const punkte = istStunden * Number(pm.mitarbeiter.rolle.faktor);
    return { ...pm, istStunden, punkte };
  });
  const summePunkte = mitMitPunkte.reduce((s, m) => s + m.punkte, 0);
  const mitMitAnteil = mitMitPunkte
    .map((m) => ({
      ...m,
      anteil:          summePunkte > 0 ? (m.punkte / summePunkte) * 100 : 0,
      guthabenStunden: summePunkte > 0 ? (m.punkte / summePunkte) * saldo : 0,
    }))
    .sort((a, b) => b.punkte - a.punkte);

  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const s = {
    page: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize:   '13px',
      color:      '#111827',
      maxWidth:   '900px',
      margin:     '0 auto',
      padding:    '32px 40px',
      lineHeight: '1.5',
    } as React.CSSProperties,

    header: {
      display:        'flex',
      justifyContent: 'space-between',
      alignItems:     'flex-start',
      borderBottom:   '2px solid #2563eb',
      paddingBottom:  '16px',
      marginBottom:   '24px',
    } as React.CSSProperties,

    logo: {
      fontSize:   '18px',
      fontWeight: 700,
      color:      '#2563eb',
    } as React.CSSProperties,

    meta: {
      fontSize: '11px',
      color:    '#6b7280',
      textAlign: 'right' as const,
    } as React.CSSProperties,

    title: {
      fontSize:     '22px',
      fontWeight:   700,
      marginBottom: '4px',
    } as React.CSSProperties,

    subtitle: {
      fontSize: '13px',
      color:    '#6b7280',
      marginBottom: '20px',
    } as React.CSSProperties,

    kpiGrid: {
      display:             'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap:                 '10px',
      marginBottom:        '20px',
    } as React.CSSProperties,

    kpiBox: {
      background:   '#f9fafb',
      border:       '1px solid #e5e7eb',
      borderRadius: '8px',
      padding:      '10px 12px',
    } as React.CSSProperties,

    kpiLabel: {
      fontSize:     '10px',
      color:        '#9ca3af',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.05em',
      marginBottom: '3px',
    } as React.CSSProperties,

    kpiValue: {
      fontSize:   '15px',
      fontWeight: 600,
    } as React.CSSProperties,

    sectionTitle: {
      fontSize:      '13px',
      fontWeight:    600,
      color:         '#374151',
      marginBottom:  '10px',
      marginTop:     '20px',
      borderBottom:  '1px solid #e5e7eb',
      paddingBottom: '4px',
    } as React.CSSProperties,

    table: {
      width:          '100%',
      borderCollapse: 'collapse' as const,
      fontSize:       '12px',
    } as React.CSSProperties,

    th: {
      textAlign:     'left' as const,
      padding:       '6px 10px',
      fontSize:      '10px',
      color:         '#6b7280',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.04em',
      borderBottom:  '1px solid #d1d5db',
      background:    '#f3f4f6',
    } as React.CSSProperties,

    td: {
      padding:      '7px 10px',
      borderBottom: '1px solid #f3f4f6',
      verticalAlign: 'middle' as const,
    } as React.CSSProperties,

    bonus: { color: '#16a34a', fontWeight: 600 } as React.CSSProperties,
    malus: { color: '#dc2626', fontWeight: 600 } as React.CSSProperties,

    printBtn: {
      display:         'inline-flex',
      alignItems:      'center',
      gap:             '6px',
      padding:         '8px 16px',
      background:      '#2563eb',
      color:           '#fff',
      border:          'none',
      borderRadius:    '8px',
      fontSize:        '13px',
      fontWeight:      600,
      cursor:          'pointer',
      marginRight:     '10px',
    } as React.CSSProperties,

    closeBtn: {
      display:      'inline-flex',
      alignItems:   'center',
      gap:          '6px',
      padding:      '8px 16px',
      background:   '#f3f4f6',
      color:        '#374151',
      border:       'none',
      borderRadius: '8px',
      fontSize:     '13px',
      fontWeight:   600,
      cursor:       'pointer',
    } as React.CSSProperties,

    toolbar: {
      display:        'flex',
      justifyContent: 'flex-end',
      gap:            '8px',
      marginBottom:   '20px',
    } as React.CSSProperties,
  };

  return (
    <>
      {/* Print-spezifische CSS */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { margin: 20mm 15mm; size: A4; }
        }
        body { background: #fff; }
      `}</style>

      <div style={s.page}>
        {/* Toolbar (nur auf Bildschirm) */}
        <div style={s.toolbar} className="no-print">
          <button style={s.closeBtn} onClick={() => window.close()}>
            ✕ Schließen
          </button>
          <button style={s.printBtn} onClick={() => window.print()}>
            🖨 Als PDF speichern
          </button>
        </div>

        {/* Briefkopf */}
        <div style={s.header}>
          <div>
            <div style={s.logo}>BonusTrack</div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Projektbericht</div>
          </div>
          <div style={s.meta}>
            <div>Erstellt am {heute}</div>
            {detail.abrechnungsJahr && <div>Abrechnungsjahr {detail.abrechnungsJahr}</div>}
          </div>
        </div>

        {/* Projekttitel */}
        <div style={s.title}>{detail.projektname}</div>
        <div style={s.subtitle}>
          {detail.projektnummer}
          {detail.abrechnungsJahr ? ` · Abrechnungsjahr ${detail.abrechnungsJahr}` : ''}
          {' · '}
          <StatusBadge status={detail.status} />
          {detail.bonusAusgeschlossen && (
            <span style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af' }}>
              (von Bonusberechnung ausgeschlossen)
            </span>
          )}
        </div>

        {/* KPI-Kacheln */}
        <div style={s.kpiGrid}>
          {[
            { l: 'IST-Stunden',  v: toHHMM(Number(detail.istStundenGesamt)),  sub: fmtDez(Number(detail.istStundenGesamt)) },
            { l: 'SOLL-Stunden', v: toHHMM(Number(detail.sollStunden)),        sub: fmtDez(Number(detail.sollStunden)) },
            { l: 'Auslastung',   v: `${proz} %`,                               sub: `${toHHMM(Number(detail.istStundenGesamt))} / ${toHHMM(Number(detail.sollStunden))}` },
            {
              l: 'Saldo',
              v: `${autoPrefix(saldo) === '+' ? '+' : autoPrefix(saldo) === '−' ? '−' : ''}${toHHMM(Math.abs(saldo))}`,
              sub: fmtDez(saldo),
              color: saldo >= 0 ? '#16a34a' : '#dc2626',
            },
          ].map(({ l, v, sub, color }) => (
            <div key={l} style={s.kpiBox}>
              <div style={s.kpiLabel}>{l}</div>
              <div style={{ ...s.kpiValue, color: color ?? '#111827' }}>{v}</div>
              <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Auslastungsbalken */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Auslastung</div>
          <div style={{ background: '#e5e7eb', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
            <div style={{
              height:          '100%',
              borderRadius:    '4px',
              backgroundColor: proz >= 100 ? '#dc2626' : proz >= 80 ? '#d97706' : '#2563eb',
              width:           `${proz}%`,
            }} />
          </div>
          <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '3px', textAlign: 'right' }}>{proz} %</div>
        </div>

        {/* Mitarbeiter-Tabelle */}
        <div style={s.sectionTitle}>
          Mitarbeiter — Gesamtstunden & Bonusanteile ({mitMitAnteil.length} MA)
        </div>
        <table style={s.table}>
          <thead>
            <tr>
              {['Name', 'Rolle', 'Ges.-Std. (HH:MM)', 'Dez.', 'Faktor', 'Punkte', 'Anteil', 'Guthaben-Std.'].map((h) => (
                <th key={h} style={{ ...s.th, textAlign: h === 'Name' || h === 'Rolle' ? 'left' : 'right' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mitMitAnteil.map((m) => (
              <tr key={m.mitarbeiterId}>
                <td style={s.td}>
                  <strong>{m.mitarbeiter.vorname} {m.mitarbeiter.nachname}</strong>
                </td>
                <td style={{ ...s.td, color: '#6b7280' }}>{m.mitarbeiter.rolle.bezeichnung}</td>
                <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {toHHMM(m.istStunden)}
                </td>
                <td style={{ ...s.td, textAlign: 'right', color: '#9ca3af', fontSize: '11px' }}>
                  {fmtDez(m.istStunden)}
                </td>
                <td style={{ ...s.td, textAlign: 'right', color: '#6b7280' }}>
                  ×{Number(m.mitarbeiter.rolle.faktor).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </td>
                <td style={{ ...s.td, textAlign: 'right' }}>
                  {m.punkte.toLocaleString('de-DE', { maximumFractionDigits: 1 })}
                </td>
                <td style={{ ...s.td, textAlign: 'right', color: '#2563eb', fontWeight: 600 }}>
                  {fmtProzent(m.anteil)}
                </td>
                <td style={{ ...s.td, textAlign: 'right', ...(m.guthabenStunden >= 0 ? s.bonus : s.malus) }}>
                  {m.guthabenStunden >= 0 ? '+' : '−'}{toHHMM(Math.abs(m.guthabenStunden))}
                  <div style={{ fontSize: '10px', fontWeight: 400, color: '#9ca3af' }}>
                    {fmtDez(m.guthabenStunden)}
                  </div>
                </td>
              </tr>
            ))}
            {/* Summenzeile */}
            <tr style={{ background: '#f9fafb', fontWeight: 600, borderTop: '2px solid #d1d5db' }}>
              <td style={{ ...s.td, fontWeight: 700 }}>Gesamt</td>
              <td style={s.td} />
              <td style={{ ...s.td, textAlign: 'right' }}>{toHHMM(Number(detail.istStundenGesamt))}</td>
              <td style={{ ...s.td, textAlign: 'right', fontSize: '11px', color: '#9ca3af' }}>{fmtDez(Number(detail.istStundenGesamt))}</td>
              <td style={s.td} />
              <td style={{ ...s.td, textAlign: 'right' }}>
                {summePunkte.toLocaleString('de-DE', { maximumFractionDigits: 1 })}
              </td>
              <td style={{ ...s.td, textAlign: 'right' }}>100,0 %</td>
              <td style={{ ...s.td, textAlign: 'right', ...(saldo >= 0 ? s.bonus : s.malus) }}>
                {saldo >= 0 ? '+' : '−'}{toHHMM(Math.abs(saldo))}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div style={{ marginTop: '32px', paddingTop: '12px', borderTop: '1px solid #e5e7eb', fontSize: '10px', color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
          <span>BonusTrack — Projektbericht</span>
          <span>{detail.projektnummer} · {heute}</span>
        </div>
      </div>
    </>
  );
}
