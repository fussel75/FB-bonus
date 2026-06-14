/**
 * Admin-Dashboard — Schritt 7
 *
 * KPI-Karten, Sync-Status, Top-Projekte Schnellübersicht
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { YearPicker } from '@/components/ui/YearPicker';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { toHHMM } from '@/lib/fmt';
import { StdAnzeige, autoPrefix } from '@/components/ui/StdAnzeige';
import {
  getBonusUebersicht,
  getSyncStatus,
  triggerSync,
  triggerExtrasSync,
  getProjekteListe,
  type ProjektMitStunden,
} from '@/api/admin';
import type { BonusUebersicht, SyncLog } from '@/types';

// ─── KPI-Karte ───────────────────────────────────────────────────────────────

interface KpiCardProps {
  label:     string;
  value:     string | number;
  sub?:      React.ReactNode;
  color?:    'bonus' | 'malus' | 'grenz' | 'info' | 'neutral';
  icon:      React.ReactNode;
  animate?:  boolean;
  decimals?: number;
  onClick?:  () => void;
}

function KpiCard({ label, value, sub, color = 'neutral', icon, animate = false, decimals = 0, onClick }: KpiCardProps) {
  const colorMap = {
    bonus:   'text-bonus-600 bg-bonus-50',
    malus:   'text-malus-600 bg-malus-50',
    grenz:   'text-grenz-600 bg-grenz-50',
    info:    'text-info-600  bg-info-50',
    neutral: 'text-gray-600  bg-gray-100',
  };

  return (
    <Card
      onClick={onClick}
      className={onClick ? 'cursor-pointer hover:shadow-md hover:border-gray-200 active:scale-[0.98] transition-all duration-150 select-none' : ''}
    >
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">
            {animate && typeof value === 'number'
              ? <AnimatedCounter value={value} decimals={decimals} />
              : value}
          </p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {onClick && (
          <svg className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>
    </Card>
  );
}

// ─── Sync-Status-Widget ───────────────────────────────────────────────────────

function SyncWidget({ logs, onSync, syncing }: {
  logs:    SyncLog[];
  onSync:  () => void;
  syncing: boolean;
}) {
  const letzter = logs[0] ?? null;
  const ok      = letzter?.status === 'erfolgreich';
  const fehler  = letzter?.status === 'fehlgeschlagen';

  const aktuellesJahr = new Date().getFullYear();
  const [extrasJahr,    setExtrasJahr]    = useState(aktuellesJahr - 1);
  const [extrasSyncing, setExtrasSyncing] = useState(false);
  const [extrasMeldung, setExtrasMeldung] = useState<string | null>(null);

  async function handleExtrasSync() {
    setExtrasSyncing(true);
    setExtrasMeldung(null);
    try {
      const r = await triggerExtrasSync(extrasJahr);
      setExtrasMeldung(`${r.kalenderjahr}: ${r.eintraege} Einträge, ${r.aktualisiert} Buchungen erstellt`);
    } catch {
      setExtrasMeldung('Fehler beim Extras-Sync.');
    } finally {
      setExtrasSyncing(false);
    }
  }

  function formatDatum(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API-Sync-Status</CardTitle>
      </CardHeader>
      <div className="space-y-3">
        {/* Status-Zeile */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                fehler   ? 'bg-malus-500' :
                ok       ? 'bg-bonus-500 animate-pulse_soft' :
                letzter?.status === 'laufend' ? 'bg-grenz-500 animate-pulse' :
                'bg-gray-300'
              }`}
            />
            <span className="text-sm font-medium text-gray-700">
              {letzter?.status === 'laufend'      ? 'Läuft…' :
               ok                                 ? 'Erfolgreich' :
               fehler                             ? 'Fehlgeschlagen' :
               'Noch kein Sync'}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onSync}
            loading={syncing}
          >
            Jetzt synchronisieren
          </Button>
        </div>

        {/* Letzte Ausführung */}
        {letzter && (
          <div className="text-xs text-gray-500 space-y-1 border-t border-gray-100 pt-3">
            <div className="flex justify-between">
              <span>Letzter Sync</span>
              <span className="font-medium text-gray-700">{formatDatum(letzter.startedAt)}</span>
            </div>
            {letzter.fehler && (
              <div className="mt-2 p-2 rounded-lg bg-malus-50 text-malus-700 text-xs">
                {letzter.fehler}
              </div>
            )}
          </div>
        )}

        {/* Letzte 5 Sync-Einträge */}
        {logs.length > 1 && (
          <div className="space-y-1 border-t border-gray-100 pt-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Protokoll</p>
            {logs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    log.status === 'erfolgreich'   ? 'bg-bonus-500' :
                    log.status === 'fehlgeschlagen' ? 'bg-malus-500' :
                    'bg-grenz-500'
                  }`} />
                  <span className="text-gray-500">{formatDatum(log.startedAt)}</span>
                </div>
                <Badge
                  variant={
                    log.status === 'erfolgreich'    ? 'bonus'   :
                    log.status === 'fehlgeschlagen'  ? 'malus'   :
                    'grenz'
                  }
                >
                  {log.manuell ? 'manuell' : 'auto'}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Extra-Stunden für Vorjahr nachholen */}
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Extra-Stunden nachholen</p>
          <div className="flex items-center gap-2">
            <select
              value={extrasJahr}
              onChange={(e) => { setExtrasJahr(Number(e.target.value)); setExtrasMeldung(null); }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-info-400"
            >
              {Array.from({ length: aktuellesJahr - 2019 }, (_, i) => aktuellesJahr - i).map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
            <Button variant="secondary" size="xs" onClick={handleExtrasSync} loading={extrasSyncing}>
              Extras-Sync
            </Button>
          </div>
          {extrasMeldung && (
            <p className={`text-xs ${extrasMeldung.startsWith('Fehler') ? 'text-malus-600' : 'text-bonus-700'}`}>
              {extrasMeldung}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Top-Projekte ─────────────────────────────────────────────────────────────

function TopProjekte({ projekte, onNavigate }: { projekte: ProjektMitStunden[]; onNavigate: () => void }) {
  // Sortiert nach Ist-Stunden absteigend, Top 5 (archivierte ausgeblendet)
  const sorted = [...projekte]
    .filter((p) => !p.archiviert)
    .sort((a, b) => b.istStundenGesamt - a.istStundenGesamt)
    .slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top-Projekte (Ist-Stunden)</CardTitle>
        <button
          onClick={onNavigate}
          className="text-xs text-info-600 hover:text-info-700 font-medium transition-colors"
        >
          Alle ansehen →
        </button>
      </CardHeader>
      <div className="space-y-3">
        {sorted.map((p) => {
          const proz = p.sollStunden > 0
            ? Math.min(100, Math.round((p.istStundenGesamt / p.sollStunden) * 100))
            : 0;
          const saldo = p.sollStunden - p.istStundenGesamt;

          return (
            <div
              key={p.id}
              className="space-y-1 cursor-pointer rounded-lg px-2 py-1.5 -mx-2 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              onClick={onNavigate}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-800 truncate max-w-[60%]">{p.projektname}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-semibold ${saldo >= 0 ? 'text-bonus-600' : 'text-malus-600'}`}>
                    <StdAnzeige h={saldo} prefix={autoPrefix(saldo)} />
                  </span>
                  <Badge
                    variant={
                      p.status === 'aktiv'         ? 'bonus'   :
                      p.status === 'pausiert'      ? 'grenz'   :
                      'neutral'
                    }
                  >
                    {p.status}
                  </Badge>
                </div>
              </div>
              {/* Soll/Ist-Balken */}
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    proz >= 100 ? 'bg-malus-500' :
                    proz >= 80  ? 'bg-grenz-500' :
                    'bg-bonus-500'
                  }`}
                  style={{ width: `${proz}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">
                {toHHMM(p.istStundenGesamt)} / {toHHMM(p.sollStunden)} ({proz}%)
              </p>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Keine Projekte vorhanden</p>
        )}
      </div>
    </Card>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconEuro = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 6.5A6 6 0 0 0 7 12a6 6 0 0 0 7.5 5.5M6 10h8M6 14h8"/>
  </svg>
);
const IconUsers = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 0 0-5.33-3.77M9 20H4v-2a4 4 0 0 1 5.33-3.77M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
  </svg>
);
const IconFolder = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
  </svg>
);
const IconRefresh = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a8.001 8.001 0 0 1 15.33-2M20 15a8.001 8.001 0 0 1-15.33 2"/>
  </svg>
);

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [jahr,     setJahr]     = useState(new Date().getFullYear());
  const [bonus,    setBonus]    = useState<BonusUebersicht | null>(null);
  const [synclogs, setSynclogs] = useState<SyncLog[]>([]);
  const [projekte, setProjekte] = useState<ProjektMitStunden[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [syncing,  setSyncing]  = useState(false);
  const [fehler,   setFehler]   = useState<string | null>(null);

  const laden = useCallback(async () => {
    setLoading(true);
    setFehler(null);
    try {
      const [b, s, p] = await Promise.all([
        getBonusUebersicht(jahr),
        getSyncStatus(),
        getProjekteListe(),
      ]);
      setBonus(b);
      setSynclogs(s);
      setProjekte(p);
    } catch {
      setFehler('Daten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [jahr]);

  useEffect(() => { laden(); }, [laden]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await triggerSync();
      const s = await getSyncStatus();
      setSynclogs(s);
    } catch {
      /* ignorieren — Sync-Status zeigt Fehler an */
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0,1,2,3].map((i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonCard className="h-64" />
          <SkeletonCard className="h-64" />
        </div>
      </div>
    );
  }

  if (fehler) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-malus-600 font-medium">{fehler}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={laden}>
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  }

  const aktiveProjekte = projekte.filter((p) => p.status === 'aktiv').length;
  const letzterSync    = synclogs[0];

  function syncAlter(): string {
    if (!letzterSync?.finishedAt) return 'Noch kein Sync';
    const diff = Date.now() - new Date(letzterSync.finishedAt).getTime();
    const min  = Math.floor(diff / 60000);
    if (min < 60)  return `vor ${min} Min.`;
    const std = Math.floor(min / 60);
    if (std < 24)  return `vor ${std} Std.`;
    return `vor ${Math.floor(std / 24)} Tagen`;
  }

  const istVorjahr = jahr < new Date().getFullYear();

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Dashboard {jahr}
            {istVorjahr && (
              <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-grenz-100 text-grenz-700">Vorjahr</span>
            )}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Bonusübersicht · Kalenderjahr</p>
        </div>
        <YearPicker value={jahr} onChange={setJahr} />
      </div>

      {/* KPI-Karten */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Gesamttopf"
          value={bonus?.gesamtTopf ?? 0}
          sub={
            <span className="flex flex-col gap-0.5">
              <span>A: {(bonus?.topfOptionA ?? 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</span>
              <span>B: {(bonus?.topfOptionB ?? 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</span>
            </span>
          }
          color="bonus"
          icon={<IconEuro />}
          animate
          decimals={2}
          onClick={() => navigate('/admin/prognose')}
        />
        <KpiCard
          label="Qualifizierte MA"
          value={`${bonus?.anzahlQualifiziert ?? 0} / ${bonus?.anzahlMitarbeiter ?? 0}`}
          sub={`${bonus?.anzahlNichtQualifiziert ?? 0} nicht qualifiziert`}
          color="info"
          icon={<IconUsers />}
          onClick={() => navigate('/admin/mitarbeiter')}
        />
        <KpiCard
          label="Aktive Projekte"
          value={aktiveProjekte}
          sub={`${projekte.length} gesamt`}
          color="neutral"
          icon={<IconFolder />}
          onClick={() => navigate('/admin/projekte')}
        />
        <KpiCard
          label="Letzter Sync"
          value={syncAlter()}
          sub={letzterSync?.status === 'fehlgeschlagen' ? 'Fehler!' : letzterSync?.status ?? '—'}
          color={
            letzterSync?.status === 'fehlgeschlagen' ? 'malus' :
            letzterSync?.status === 'erfolgreich'    ? 'bonus' :
            'neutral'
          }
          icon={<IconRefresh />}
          onClick={handleSync}
        />
      </div>

      {/* Zweispaltig: Sync + Top-Projekte */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SyncWidget logs={synclogs} onSync={handleSync} syncing={syncing} />
        <TopProjekte projekte={projekte} onNavigate={() => navigate('/admin/projekte')} />
      </div>

      {/* Bonus-Übersicht-Tabelle */}
      {bonus && bonus.mitarbeiter.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bonus-Übersicht {jahr}{istVorjahr ? ' (Endabrechnung)' : ''}</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="py-2 pr-4">Mitarbeiter</th>
                  <th className="py-2 pr-4 text-right">Option A</th>
                  <th className="py-2 pr-4 text-right">Option B</th>
                  <th className="py-2 pr-4 text-right">Gesamt</th>
                  <th className="py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bonus.mitarbeiter
                  .sort((a, b) => b.gesamtBetrag - a.gesamtBetrag)
                  .slice(0, 10)
                  .map((ma) => (
                    <tr key={ma.mitarbeiterId} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2.5 pr-4 font-medium text-gray-800">{ma.mitarbeiterName}</td>
                      <td className="py-2.5 pr-4 text-right text-gray-600">
                        {ma.optionA_betrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-gray-600">
                        {ma.optionB_betrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-semibold text-bonus-700">
                        {ma.gesamtBetrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                      </td>
                      <td className="py-2.5 text-center">
                        <Badge variant={ma.qualifiziert ? 'bonus' : 'malus'} dot>
                          {ma.qualifiziert ? 'qualifiziert' : 'nein'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {bonus.mitarbeiter.length > 10 && (
              <p className="text-xs text-gray-400 text-center py-3">
                + {bonus.mitarbeiter.length - 10} weitere Mitarbeiter
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
