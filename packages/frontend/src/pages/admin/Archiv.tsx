/**
 * Admin — Projektarchiv
 *
 * Zeigt alle archivierten Projekte, filterbar nach Jahr + Name,
 * sortierbar nach allen Spalten. Klick → Detailmodal (xl, kein h-scroll).
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { getArchiv, type ProjektMitStunden } from '@/api/admin';
import { toHHMM } from '@/lib/fmt';
import { StdAnzeige, autoPrefix } from '@/components/ui/StdAnzeige';
import type { ProjektStatus } from '@/types';

function statusVariant(s: ProjektStatus) {
  return s === 'aktiv' ? 'bonus' : s === 'abgeschlossen' ? 'neutral' : 'grenz';
}

// ─── Sortierpfeil ─────────────────────────────────────────────────────────────

function SortIcon({ aktiv, dir }: { aktiv: boolean; dir: 'asc' | 'desc' }) {
  if (!aktiv) return <span className="ml-1 text-gray-300">↕</span>;
  return <span className="ml-1 text-info-500">{dir === 'asc' ? '↑' : '↓'}</span>;
}

// ─── Detailmodal (schreibgeschützt) ──────────────────────────────────────────

function ArchivDetailModal({ projekt, onClose }: { projekt: ProjektMitStunden; onClose: () => void }) {
  const saldo = projekt.sollStunden - projekt.istStundenGesamt;
  const proz  = projekt.sollStunden > 0
    ? Math.min(100, Math.round((projekt.istStundenGesamt / projekt.sollStunden) * 100))
    : 0;

  type PmEntry = ProjektMitStunden['mitarbeiterStunden'][0];
  const grouped = new Map<number, { pm: PmEntry; istStunden: number }>();
  for (const pm of projekt.mitarbeiterStunden) {
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
    anteil:          summePunkte > 0 ? (m.punkte / summePunkte) * 100 : 0,
    guthabenStunden: summePunkte > 0 ? (m.punkte / summePunkte) * saldo : 0,
  }));

  return (
    <Modal onClose={onClose} title={projekt.projektname} size="2xl">
      <div className="space-y-5">
        {/* Header-KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { l: 'Projektnummer',  v: projekt.projektnummer },
            { l: 'Abrechnungsjahr', v: <span className="font-bold text-info-700">{projekt.abrechnungsJahr}</span> },
            { l: 'Soll-Stunden',   v: <StdAnzeige h={Number(projekt.sollStunden)} /> },
            {
              l: 'Saldo',
              v: <span className={saldo >= 0 ? 'text-bonus-600 font-semibold' : 'text-malus-600 font-semibold'}>
                <StdAnzeige h={saldo} prefix={autoPrefix(saldo)} />
              </span>,
            },
          ].map(({ l, v }) => (
            <div key={l} className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">{l}</p>
              <p className="text-sm font-medium text-gray-800">{v as React.ReactNode}</p>
            </div>
          ))}
        </div>

        {/* Auslastungsbalken */}
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Auslastung (Ist / Soll)</span>
            <span>{toHHMM(projekt.istStundenGesamt)} / {toHHMM(projekt.sollStunden)} — {proz}%</span>
          </div>
          <ProgressBar value={proz} />
        </div>

        {/* Info-Banner */}
        <div className="bg-info-50 border border-info-100 rounded-xl px-4 py-3 text-xs text-info-700">
          Dieses Projekt wurde in der Bonusberechnung {projekt.abrechnungsJahr} mit den
          Gesamtstunden aller Mitarbeiter über die komplette Laufzeit abgerechnet.
        </div>

        {/* Mitarbeiter-Tabelle */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            Mitarbeiter (Gesamtstunden Laufzeit)
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4 hidden sm:table-cell">Rolle</th>
                  <th className="py-2 pr-4 text-right">Ges.-Std.</th>
                  <th className="py-2 pr-4 text-right hidden sm:table-cell">Faktor</th>
                  <th className="py-2 pr-4 text-right hidden sm:table-cell">Punkte</th>
                  <th className="py-2 pr-4 text-right hidden sm:table-cell">Anteil</th>
                  <th className="py-2 text-right">Guthaben</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {mitMitAnteil
                  .sort((a, b) => b.punkte - a.punkte)
                  .map((pm) => (
                    <tr key={pm.mitarbeiterId} className="hover:bg-gray-50">
                      <td className="py-2.5 pr-4 font-medium text-gray-800 whitespace-nowrap">
                        {pm.mitarbeiter.vorname} {pm.mitarbeiter.nachname}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap hidden sm:table-cell">{pm.mitarbeiter.rolle.bezeichnung}</td>
                      <td className="py-2.5 pr-4 text-right text-gray-700">
                        <StdAnzeige h={pm.istStunden} stacked />
                      </td>
                      <td className="py-2.5 pr-4 text-right text-gray-500 hidden sm:table-cell">
                        ×{Number(pm.mitarbeiter.rolle.faktor).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-gray-700 hidden sm:table-cell">
                        {pm.punkte.toLocaleString('de-DE', { maximumFractionDigits: 1 })}
                      </td>
                      <td className="py-2.5 pr-4 text-right hidden sm:table-cell">
                        <span className="font-semibold text-info-600">
                          {pm.anteil.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                        </span>
                      </td>
                      <td className={`py-2.5 text-right font-semibold ${pm.guthabenStunden >= 0 ? 'text-bonus-600' : 'text-malus-600'}`}>
                        <StdAnzeige h={pm.guthabenStunden} prefix={autoPrefix(pm.guthabenStunden)} stacked />
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
      </div>
    </Modal>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

type SortKey = 'name' | 'jahr' | 'status' | 'auslastung' | 'saldo' | 'team';

export default function AdminArchiv() {
  const [projekte,    setProjekte]    = useState<ProjektMitStunden[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [fehler,      setFehler]      = useState<string | null>(null);
  const [detailP,     setDetailP]     = useState<ProjektMitStunden | null>(null);
  const [jahrFilter,  setJahrFilter]  = useState<number | 'alle'>('alle');
  const [suche,       setSuche]       = useState('');
  const [sortKey,     setSortKey]     = useState<SortKey>('jahr');
  const [sortDir,     setSortDir]     = useState<'asc' | 'desc'>('desc');

  const laden = useCallback(async () => {
    setLoading(true);
    setFehler(null);
    try {
      setProjekte(await getArchiv());
    } catch {
      setFehler('Archiv konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const jahre = useMemo(() =>
    Array.from(new Set(projekte.map((p) => p.abrechnungsJahr!))).sort((a, b) => b - a),
    [projekte],
  );

  const gefiltert = useMemo(() => {
    let liste = jahrFilter === 'alle'
      ? projekte
      : projekte.filter((p) => p.abrechnungsJahr === jahrFilter);

    const s = suche.trim().toLowerCase();
    if (s) {
      liste = liste.filter((p) =>
        p.projektname.toLowerCase().includes(s) ||
        p.projektnummer.toLowerCase().includes(s),
      );
    }

    return [...liste].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':       cmp = a.projektname.localeCompare(b.projektname, 'de'); break;
        case 'jahr':       cmp = (a.abrechnungsJahr ?? 0) - (b.abrechnungsJahr ?? 0); break;
        case 'status':     cmp = a.status.localeCompare(b.status, 'de'); break;
        case 'auslastung': {
          const pA = a.sollStunden > 0 ? a.istStundenGesamt / a.sollStunden : 0;
          const pB = b.sollStunden > 0 ? b.istStundenGesamt / b.sollStunden : 0;
          cmp = pA - pB; break;
        }
        case 'saldo': cmp = (a.sollStunden - a.istStundenGesamt) - (b.sollStunden - b.istStundenGesamt); break;
        case 'team': {
          const tA = new Set(a.mitarbeiterStunden.map((pm) => pm.mitarbeiterId)).size;
          const tB = new Set(b.mitarbeiterStunden.map((pm) => pm.mitarbeiterId)).size;
          cmp = tA - tB; break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [projekte, jahrFilter, suche, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const thClass = (_key: SortKey, align: 'left' | 'center' | 'right' = 'left') =>
    `py-2 pr-4 cursor-pointer select-none hover:text-gray-700 transition-colors text-${align} whitespace-nowrap`;

  if (loading) {
    return (
      <div className="space-y-4 animate-fadeIn">
        <SkeletonCard /><SkeletonCard className="h-64" />
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
      {/* Kennzahlen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { l: 'Archivierte Projekte', v: projekte.length },
          { l: 'Abrechnungsjahre',     v: jahre.length },
          {
            l: 'Gesamtsaldo (Archiv)',
            v: (() => {
              const s = projekte.reduce((sum, p) => sum + (Number(p.sollStunden) - Number(p.istStundenGesamt)), 0);
              return <StdAnzeige h={s} prefix={autoPrefix(s)} />;
            })(),
          },
        ].map(({ l, v }) => (
          <Card key={l}>
            <p className="text-xs text-gray-400 uppercase tracking-wide">{l}</p>
            <p className="text-xl font-bold text-gray-900">{v}</p>
          </Card>
        ))}
      </div>

      {/* Filter-Zeile: Suche + Jahres-Tabs */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Suche */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Projektname oder Nummer suchen …"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-400 focus:border-transparent"
            />
          </div>
          {/* Jahr-Filter */}
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => setJahrFilter('alle')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                jahrFilter === 'alle' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Alle Jahre
            </button>
            {jahre.map((j) => (
              <button
                key={j}
                onClick={() => setJahrFilter(j)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  jahrFilter === j ? 'bg-info-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {j}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Projektliste */}
      <Card>
        <CardHeader>
          <CardTitle>
            {gefiltert.length} {gefiltert.length === 1 ? 'Projekt' : 'Projekte'}
            {(suche || jahrFilter !== 'alle') && (
              <span className="ml-2 text-xs font-normal text-gray-400">
                (gefiltert von {projekte.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>

        {gefiltert.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-400">Keine Projekte gefunden</p>
            {(suche || jahrFilter !== 'alle') && (
              <button
                className="text-xs text-info-500 hover:underline mt-1"
                onClick={() => { setSuche(''); setJahrFilter('alle'); }}
              >
                Filter zurücksetzen
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className={thClass('name')} onClick={() => toggleSort('name')}>
                    Projekt <SortIcon aktiv={sortKey === 'name'} dir={sortDir} />
                  </th>
                  <th className={thClass('jahr', 'center')} onClick={() => toggleSort('jahr')}>
                    Abr.-Jahr <SortIcon aktiv={sortKey === 'jahr'} dir={sortDir} />
                  </th>
                  <th className={thClass('status', 'center')} onClick={() => toggleSort('status')}>
                    Status <SortIcon aktiv={sortKey === 'status'} dir={sortDir} />
                  </th>
                  <th className={thClass('auslastung')} onClick={() => toggleSort('auslastung')}>
                    Auslastung <SortIcon aktiv={sortKey === 'auslastung'} dir={sortDir} />
                  </th>
                  <th className={thClass('saldo', 'right')} onClick={() => toggleSort('saldo')}>
                    Saldo <SortIcon aktiv={sortKey === 'saldo'} dir={sortDir} />
                  </th>
                  <th className={thClass('team', 'right')} onClick={() => toggleSort('team')}>
                    Team <SortIcon aktiv={sortKey === 'team'} dir={sortDir} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {gefiltert.map((p) => {
                  const saldo   = Number(p.sollStunden) - Number(p.istStundenGesamt);
                  const proz    = Number(p.sollStunden) > 0
                    ? Math.min(100, Math.round((Number(p.istStundenGesamt) / Number(p.sollStunden)) * 100))
                    : 0;
                  const uniqueMa = new Set(p.mitarbeiterStunden.map((pm) => pm.mitarbeiterId)).size;

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors group"
                      onClick={() => setDetailP(p)}
                    >
                      <td className="py-3 pr-4">
                        <p className="font-medium text-gray-800 group-hover:text-info-600 transition-colors">
                          {p.projektname}
                        </p>
                        <p className="text-xs text-gray-400">{p.projektnummer}</p>
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <span className="text-xs font-semibold text-info-700 bg-info-50 px-2 py-0.5 rounded-full">
                          {p.abrechnungsJahr}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="min-w-[120px]">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>{toHHMM(Number(p.istStundenGesamt))}</span>
                            <span>{toHHMM(Number(p.sollStunden))}</span>
                          </div>
                          <ProgressBar value={proz} className="h-1.5" />
                          <p className="text-xs text-gray-400 mt-0.5 text-right">{proz}%</p>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className={`font-semibold text-sm ${saldo >= 0 ? 'text-bonus-600' : 'text-malus-600'}`}>
                          <StdAnzeige h={saldo} prefix={autoPrefix(saldo)} />
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <span className="text-xs font-medium text-gray-500">{uniqueMa} MA</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {detailP && (
        <ArchivDetailModal projekt={detailP} onClose={() => setDetailP(null)} />
      )}
    </div>
  );
}
