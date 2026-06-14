/**
 * Admin — Projektübersicht
 *
 * - Alle Projekte (inkl. archivierter) mit Soll/Ist-Balken, Saldo, Status-Badge
 * - Jahr-Filter anhand Projektnummer-Präfix (z.B. "25-", "26-")
 * - Status-Filter + Suche + CSV-Export
 * - Klick → Detailmodal mit Mitarbeitern, Toggle "Ab ins Archiv" & Abrechnungsjahr
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import {
  getProjekteListe,
  getProjektDetail,
  getKonfiguration,
  toggleBonusAusschluss,
  toggleArchiviert,
  setAbrechnungsjahr,
  type ProjektMitStunden,
} from '@/api/admin';
import { toHHMM } from '@/lib/fmt';
import { StdAnzeige, autoPrefix } from '@/components/ui/StdAnzeige';
import type { ProjektStatus } from '@/types';

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function statusVariant(s: ProjektStatus) {
  return s === 'aktiv' ? 'bonus' : s === 'pausiert' ? 'grenz' : 'neutral';
}

function jahrAusProjektnummer(nr: string): string | null {
  const m = nr.match(/^(\d{2})-/);
  return m ? `20${m[1]}` : null;
}

// ─── CSV-Export ───────────────────────────────────────────────────────────────

function exportCSV(projekte: ProjektMitStunden[]) {
  const rows = projekte.map((p) => {
    const saldo = p.sollStunden - p.istStundenGesamt;
    const proz  = p.sollStunden > 0
      ? Math.round((p.istStundenGesamt / p.sollStunden) * 100)
      : 0;
    return {
      Projektnummer:   p.projektnummer,
      Projektname:     p.projektname,
      Status:          p.status,
      'Soll-Stunden':  p.sollStunden,
      'Ist-Stunden':   p.istStundenGesamt,
      'Saldo (h)':     saldo,
      'Auslastung (%)': `${proz}%`,
    };
  });

  // escapeFormulae neutralisiert führende Formelzeichen (=, +, -, @)
  // und verhindert so CSV-Formula-Injection beim Öffnen in Excel o.Ä.
  // columns stellt sicher, dass die Kopfzeile auch bei leerer Liste erscheint.
  const COLUMNS = ['Projektnummer', 'Projektname', 'Status', 'Soll-Stunden', 'Ist-Stunden', 'Saldo (h)', 'Auslastung (%)'];
  const csv  = Papa.unparse(rows, {
    delimiter:      ';',
    newline:        '\r\n',
    escapeFormulae: true,
    columns:        COLUMNS,
  });

  const BOM  = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `bonustrack_projekte_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Detailmodal ──────────────────────────────────────────────────────────────

function ProjektDetailModal({
  projektId,
  onClose,
  onRefresh,
  schwelleProzent,
}: {
  projektId:       number;
  onClose:         () => void;
  onRefresh:       () => void;
  schwelleProzent: number;
}) {
  const [detail,            setDetail]            = useState<ProjektMitStunden | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [bonusAusg,         setBonusAusg]         = useState(false);
  const [toggling,          setToggling]           = useState(false);
  const [archiviert,        setArchiviert]         = useState(false);
  const [togglingArchiv,    setTogglingArchiv]     = useState(false);
  const [abrJahr,           setAbrJahr]           = useState<number | null>(null);
  const [abrJahrDraft,      setAbrJahrDraft]      = useState('');
  const [savingAbrJahr,     setSavingAbrJahr]     = useState(false);
  const [abrJahrSuccess,    setAbrJahrSuccess]    = useState(false);

  useEffect(() => {
    getProjektDetail(projektId)
      .then((d) => {
        setDetail(d);
        setBonusAusg(d.bonusAusgeschlossen);
        setArchiviert(d.archiviert ?? false);
        setAbrJahr(d.abrechnungsJahr ?? null);
        setAbrJahrDraft(d.abrechnungsJahr ? String(d.abrechnungsJahr) : '');
      })
      .finally(() => setLoading(false));
  }, [projektId]);

  const handleToggleBonusAusschluss = async () => {
    setToggling(true);
    try {
      const res = await toggleBonusAusschluss(projektId);
      setBonusAusg(res.bonusAusgeschlossen);
      onRefresh();
    } finally {
      setToggling(false);
    }
  };

  const handleToggleArchiviert = async () => {
    setTogglingArchiv(true);
    try {
      const res = await toggleArchiviert(projektId, !archiviert);
      setArchiviert(res.archiviert);
      onRefresh();
    } finally {
      setTogglingArchiv(false);
    }
  };

  const handleSaveAbrJahr = async (jahr: number | null) => {
    setSavingAbrJahr(true);
    try {
      const res = await setAbrechnungsjahr(projektId, jahr);
      setAbrJahr(res.abrechnungsJahr);
      setAbrJahrDraft(res.abrechnungsJahr ? String(res.abrechnungsJahr) : '');
      setAbrJahrSuccess(true);
      setTimeout(() => setAbrJahrSuccess(false), 2000);
      onRefresh();
    } finally {
      setSavingAbrJahr(false);
    }
  };

  const saldo = detail ? detail.sollStunden - detail.istStundenGesamt : 0;
  const proz  = detail && detail.sollStunden > 0
    ? Math.min(100, Math.round((detail.istStundenGesamt / detail.sollStunden) * 100))
    : 0;

  type PmEntry = ProjektMitStunden['mitarbeiterStunden'][0];
  const grouped = new Map<number, { pm: PmEntry; istStunden: number }>();
  for (const pm of (detail?.mitarbeiterStunden ?? [])) {
    const id = pm.mitarbeiterId;
    if (grouped.has(id)) {
      grouped.get(id)!.istStunden += Number(pm.istStunden);
    } else {
      grouped.set(id, { pm, istStunden: Number(pm.istStunden) });
    }
  }
  const mitarbeiterMitAnteil = Array.from(grouped.values()).map(({ pm, istStunden }) => {
    const punkte = istStunden * Number(pm.mitarbeiter.rolle.faktor);
    return { ...pm, istStunden, punkte };
  });
  const summePunkte = mitarbeiterMitAnteil.reduce((s, m) => s + m.punkte, 0);
  const mitMitAnteil = mitarbeiterMitAnteil.map((m) => ({
    ...m,
    anteil: summePunkte > 0 ? (m.punkte / summePunkte) * 100 : 0,
    guthabenStunden: summePunkte > 0 ? (m.punkte / summePunkte) * saldo : 0,
  }));

  return (
    <Modal onClose={onClose} title={detail?.projektname ?? 'Projekt'} size="xl">
      {loading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : detail ? (
        <div className="space-y-5">
          {/* Header-Info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { l: 'Projektnummer', v: detail.projektnummer },
              { l: 'Status',        v: <Badge variant={statusVariant(detail.status)}>{detail.status}</Badge> },
              { l: 'Soll-Stunden',  v: <StdAnzeige h={detail.sollStunden} /> },
              { l: 'Saldo',         v: <span className={saldo >= 0 ? 'text-bonus-600 font-semibold' : 'text-malus-600 font-semibold'}><StdAnzeige h={saldo} prefix={autoPrefix(saldo)} /></span> },
            ].map(({ l, v }) => (
              <div key={l} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">{l}</p>
                <p className="text-sm font-medium text-gray-800">{v as React.ReactNode}</p>
              </div>
            ))}
          </div>

          {/* Fortschrittsbalken mit Schwellenwert-Markierung */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>Auslastung</span>
              <span>{proz}%{proz >= schwelleProzent ? ' ✓' : ` · Ziel: ${schwelleProzent} %`}</span>
            </div>
            <ProgressBar value={proz} schwelleProzent={schwelleProzent} />
          </div>

          {/* Bonus-Ausschluss-Toggle */}
          <div className={`flex items-start justify-between gap-4 rounded-xl px-4 py-3 border ${
            bonusAusg
              ? 'bg-grenz-50 border-grenz-200'
              : 'bg-gray-50 border-gray-100'
          }`}>
            <div>
              <p className="text-sm font-medium text-gray-800">
                Bonus-Ausschluss (Option B)
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {bonusAusg
                  ? 'Dieses Projekt fließt nicht in die Bonus-Berechnung ein.'
                  : 'Projekt fließt normal in die Option-B-Berechnung ein (sofern Auslastung ausreicht).'}
              </p>
            </div>
            <button
              onClick={handleToggleBonusAusschluss}
              disabled={toggling}
              className={`relative flex-shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                bonusAusg ? 'bg-grenz-500' : 'bg-gray-200'
              } ${toggling ? 'opacity-50 cursor-wait' : ''}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  bonusAusg ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Abrechnungsjahr */}
          <div className={`rounded-xl px-4 py-3 border ${
            abrJahr ? 'bg-info-50 border-info-200' : 'bg-gray-50 border-gray-100'
          }`}>
            <div className="flex items-start justify-between gap-2 mb-0.5">
              <p className="text-sm font-medium text-gray-800">Abrechnungsjahr</p>
              {abrJahrSuccess && (
                <span className="text-xs text-bonus-600 font-medium">✓ Gespeichert</span>
              )}
              {savingAbrJahr && (
                <span className="text-xs text-gray-400">Speichert…</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-3">
              {abrJahr
                ? `Dieses Projekt wird dem Bonusjahr ${abrJahr} zugeordnet — jahresspezifische Stunden fließen in die Berechnung ein.`
                : 'Ohne Abrechnungsjahr zählt das Projekt immer im aktuellen Bonusjahr mit. Mit Jahres-Zuordnung wird es einem bestimmten Jahr fest zugewiesen.'}
            </p>
            <select
              value={abrJahrDraft}
              disabled={savingAbrJahr}
              onChange={(e) => {
                const val = e.target.value;
                setAbrJahrDraft(val);
                handleSaveAbrJahr(val ? Number(val) : null);
              }}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500 bg-white disabled:opacity-50"
            >
              <option value="">— kein Abrechnungsjahr —</option>
              {[2023, 2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Ab ins Archiv */}
          <div className={`flex items-start justify-between gap-4 rounded-xl px-4 py-3 border ${
            archiviert
              ? 'bg-amber-50 border-amber-200'
              : 'bg-gray-50 border-gray-100'
          }`}>
            <div>
              <p className="text-sm font-medium text-gray-800">
                Ab ins Archiv
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {archiviert
                  ? 'Projekt ist archiviert. In der Bonus-Berechnung werden alle Gesamtstunden (gesamte Laufzeit) einbezogen — kein Auslastungs-Schwellenwert.'
                  : 'Projekt ist aktiv. Im Archiv werden alle Stunden der gesamten Projektlaufzeit für die Abrechnung herangezogen.'}
              </p>
            </div>
            <button
              onClick={handleToggleArchiviert}
              disabled={togglingArchiv}
              className={`relative flex-shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                archiviert ? 'bg-amber-500' : 'bg-gray-200'
              } ${togglingArchiv ? 'opacity-50 cursor-wait' : ''}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  archiviert ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Mitarbeiter-Tabelle */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">
              Mitarbeiter & Bonus-Anteil
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Rolle</th>
                    <th className="py-2 pr-3 text-right">Ist-Std.</th>
                    <th className="py-2 pr-3 text-right">Faktor</th>
                    <th className="py-2 pr-3 text-right">Punkte</th>
                    <th className="py-2 text-right">Anteil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {mitMitAnteil
                    .sort((a, b) => b.punkte - a.punkte)
                    .map((pm) => (
                      <tr key={pm.mitarbeiterId} className="hover:bg-gray-50">
                        <td className="py-2 pr-3 font-medium text-gray-800">
                          {pm.mitarbeiter.vorname} {pm.mitarbeiter.nachname}
                        </td>
                        <td className="py-2 pr-3 text-gray-500">{pm.mitarbeiter.rolle.bezeichnung}</td>
                        <td className="py-2 pr-3 text-right text-gray-700">
                          <StdAnzeige h={Number(pm.istStunden)} stacked />
                        </td>
                        <td className="py-2 pr-3 text-right text-gray-500">
                          ×{Number(pm.mitarbeiter.rolle.faktor).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </td>
                        <td className="py-2 pr-3 text-right text-gray-700">
                          {pm.punkte.toLocaleString('de-DE', { maximumFractionDigits: 1 })}
                        </td>
                        <td className="py-2 text-right">
                          <span className="font-semibold text-info-600">
                            {Number(pm.anteil).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {mitMitAnteil.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Keine Mitarbeiter zugeordnet</p>
              )}
            </div>
          </div>

          {/* Bericht-Button */}
          <div className="pt-2 flex justify-end border-t border-gray-100 mt-2">
            <button
              onClick={() => window.open(`/admin/projekte/${projektId}/bericht`, '_blank')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-info-50 hover:bg-info-100 text-info-700 text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Bericht als PDF
            </button>
          </div>
        </div>
      ) : (
        <p className="text-malus-600 text-sm">Projekt konnte nicht geladen werden.</p>
      )}
    </Modal>
  );
}

// ─── Projektzeile ─────────────────────────────────────────────────────────────

function ProjektZeile({ p, onClick, schwelleProzent }: { p: ProjektMitStunden; onClick: () => void; schwelleProzent: number }) {
  const saldo = p.sollStunden - p.istStundenGesamt;
  const proz  = p.sollStunden > 0
    ? Math.min(100, Math.round((p.istStundenGesamt / p.sollStunden) * 100))
    : 0;

  return (
    <tr
      className="hover:bg-gray-50 transition-colors cursor-pointer group"
      onClick={onClick}
    >
      <td className="py-3 pr-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-800 group-hover:text-info-600 transition-colors">
              {p.projektname}
            </p>
            {p.archiviert && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                Archiv
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">{p.projektnummer}</p>
        </div>
      </td>
      <td className="py-3 pr-4 text-center hidden sm:table-cell">
        <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
      </td>
      <td className="py-3 pr-4 hidden md:table-cell">
        <div className="min-w-[100px]">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{toHHMM(p.istStundenGesamt)}</span>
            <span>{toHHMM(p.sollStunden)}</span>
          </div>
          <ProgressBar value={proz} size="sm" schwelleProzent={schwelleProzent} />
          <p className="text-xs text-gray-400 mt-0.5 text-right">{proz}%</p>
        </div>
      </td>
      <td className="py-3 pr-4 text-right">
        <span className={`font-semibold text-sm ${saldo >= 0 ? 'text-bonus-600' : 'text-malus-600'}`}>
          <StdAnzeige h={saldo} prefix={autoPrefix(saldo)} />
        </span>
      </td>
      <td className="py-3 text-right hidden sm:table-cell">
        <span className="text-xs font-medium text-gray-500">
          {new Set(p.mitarbeiterStunden?.map(m => m.mitarbeiterId) ?? []).size} MA
        </span>
      </td>
    </tr>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function AdminProjekte() {
  const [projekte,         setProjekte]         = useState<ProjektMitStunden[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [fehler,           setFehler]           = useState<string | null>(null);
  const [detailId,         setDetailId]         = useState<number | null>(null);
  const [statusFilter,     setStatusFilter]     = useState<ProjektStatus | 'alle'>('alle');
  const [jahrFilter,       setJahrFilter]       = useState<string>(String(new Date().getFullYear()));
  const [suche,            setSuche]            = useState('');
  const [extraModal,       setExtraModal]       = useState(false);
  const [schwelleProzent,  setSchwelleProzent]  = useState(90);

  const laden = useCallback(async () => {
    setLoading(true);
    setFehler(null);
    try {
      const [data, konfig] = await Promise.all([getProjekteListe(), getKonfiguration()]);
      setProjekte(data);
      setSchwelleProzent(konfig.mindest_auslastung_bonusrelevant ?? 90);
    } catch {
      setFehler('Projekte konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { laden(); }, [laden]);

  // Ausgeschlossene Projekte werden laut Konfiguration nicht in der Übersicht angezeigt
  const sichtbar = useMemo(
    () => projekte.filter((p) => !p.bonusAusgeschlossen),
    [projekte],
  );

  // Verfügbare Jahre aus Projektnummern ermitteln
  const verfuegbareJahre = useMemo(() => {
    const jahre = new Set<string>();
    for (const p of sichtbar) {
      const j = jahrAusProjektnummer(p.projektnummer);
      if (j) jahre.add(j);
    }
    return Array.from(jahre).sort((a, b) => Number(b) - Number(a));
  }, [sichtbar]);

  const gefiltert = sichtbar.filter((p) => {
    if (jahrFilter !== 'alle') {
      const j = jahrAusProjektnummer(p.projektnummer);
      if (j !== jahrFilter) return false;
    }
    const matchStatus = statusFilter === 'alle' || p.status === statusFilter;
    const matchSuche  = !suche || p.projektname.toLowerCase().includes(suche.toLowerCase()) ||
                        p.projektnummer.toLowerCase().includes(suche.toLowerCase());
    return matchStatus && matchSuche;
  });

  const gesamt      = sichtbar.length;
  const aktiv       = sichtbar.filter((p) => p.status === 'aktiv').length;
  const gesamtSaldo = sichtbar.reduce((s, p) => s + (p.sollStunden - p.istStundenGesamt), 0);

  // Alle Einträge mit extraStunden > 0 aus allen (ungefilterten) Projekten
  const extraEintraege = useMemo(() => {
    const liste: { name: string; projekt: string; stunden: number }[] = [];
    for (const p of projekte) {
      for (const ms of p.mitarbeiterStunden) {
        const h = Number(ms.extraStunden);
        if (h > 0) {
          liste.push({
            name:    `${ms.mitarbeiter.vorname} ${ms.mitarbeiter.nachname}`,
            projekt: `${p.projektnummer} – ${p.projektname}`,
            stunden: h,
          });
        }
      }
    }
    return liste.sort((a, b) => b.stunden - a.stunden);
  }, [projekte]);
  const extraGesamt = extraEintraege.reduce((s, e) => s + e.stunden, 0);

  if (loading) {
    return (
      <div className="space-y-4 animate-fadeIn">
        <SkeletonCard />
        <SkeletonCard className="h-96" />
      </div>
    );
  }

  if (fehler) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-malus-600 font-medium">{fehler}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={laden}>Erneut versuchen</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Kennzahlen-Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { l: 'Gesamt',      v: gesamt,   sub: 'Projekte' },
          { l: 'Aktiv',       v: aktiv,    sub: 'laufend' },
          { l: 'Gesamtsaldo', v: <StdAnzeige h={gesamtSaldo} prefix={autoPrefix(gesamtSaldo)} />, sub: 'Soll − Ist' },
        ].map(({ l, v, sub }) => (
          <Card key={l}>
            <p className="text-xs text-gray-400 uppercase tracking-wide">{l}</p>
            <p className="text-xl font-bold text-gray-900">{v}</p>
            <p className="text-xs text-gray-400">{sub}</p>
          </Card>
        ))}

        {/* Extrastunden-Kachel (klickbar) */}
        <button
          onClick={() => setExtraModal(true)}
          className="text-left group"
        >
          <Card className="hover:border-info-300 hover:shadow-md transition-all cursor-pointer group-hover:bg-info-50/40">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Extrastunden</p>
            <p className="text-xl font-bold text-info-600">
              <StdAnzeige h={extraGesamt} />
            </p>
            <p className="text-xs text-gray-400">
              {extraEintraege.length} Einträge &rsaquo;
            </p>
          </Card>
        </button>
      </div>

      {/* Filter + Export */}
      <Card>
        <div className="flex flex-col gap-3">
          {/* Zeile 1: Jahr-Filter */}
          <div className="flex flex-wrap gap-2">
            {(['alle', ...verfuegbareJahre] as string[]).map((j) => (
              <button
                key={j}
                onClick={() => setJahrFilter(j)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  jahrFilter === j
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {j === 'alle' ? 'Alle Jahre' : j}
              </button>
            ))}
          </div>

          {/* Zeile 2: Status-Filter + Suche + Export */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {(['alle', 'aktiv', 'pausiert', 'abgeschlossen'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? 'bg-info-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {s === 'alle' ? 'Alle' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Projekt suchen…"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                className="flex-1 sm:w-56 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportCSV(gefiltert)}
              >
                CSV Export
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabelle */}
      <Card>
        <CardHeader>
          <CardTitle>
            {gefiltert.length} {gefiltert.length === 1 ? 'Projekt' : 'Projekte'}
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 pr-4">Projekt</th>
                <th className="py-2 pr-4 text-center hidden sm:table-cell">Status</th>
                <th className="py-2 pr-4 hidden md:table-cell">Auslastung</th>
                <th className="py-2 pr-4 text-right">Saldo</th>
                <th className="py-2 text-right hidden sm:table-cell">Team</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {gefiltert.map((p) => (
                <ProjektZeile key={p.id} p={p} onClick={() => setDetailId(p.id)} schwelleProzent={schwelleProzent} />
              ))}
            </tbody>
          </table>
          {gefiltert.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400">Keine Projekte gefunden</p>
            </div>
          )}
        </div>
      </Card>

      {/* Detailmodal */}
      {detailId !== null && (
        <ProjektDetailModal
          projektId={detailId}
          onClose={() => setDetailId(null)}
          onRefresh={laden}
          schwelleProzent={schwelleProzent}
        />
      )}

      {/* Extrastunden-Modal */}
      {extraModal && (
        <Modal onClose={() => setExtraModal(false)} title="Extrastunden" size="lg">
          {extraEintraege.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Keine Extrastunden erfasst.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="py-2 pr-4">Mitarbeiter</th>
                    <th className="py-2 pr-4">Projekt</th>
                    <th className="py-2 text-right">Extrastunden</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {extraEintraege.map((e, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-2 pr-4 font-medium text-gray-800">{e.name}</td>
                      <td className="py-2 pr-4 text-gray-500 text-xs">{e.projekt}</td>
                      <td className="py-2 text-right">
                        <span className="font-semibold text-info-600">
                          <StdAnzeige h={e.stunden} prefix="+" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 font-semibold">
                    <td className="py-2 pr-4 text-gray-700" colSpan={2}>Gesamt</td>
                    <td className="py-2 text-right text-info-600">
                      <StdAnzeige h={extraGesamt} prefix="+" />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
