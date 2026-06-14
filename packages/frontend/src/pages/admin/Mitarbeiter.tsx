/**
 * Admin — Mitarbeiterverwaltung
 *
 * - Liste mit Kontostand, Kranktagen, Qualifikations-Status
 * - Inline-Edit: Kranktage korrigieren, Rolle ändern, Präferenz setzen
 * - Kranktage-Warnung-Badge ab 80% des Schwellenwerts
 */

import { useState, useCallback, useEffect, FormEvent } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { getMitarbeiterListe, patchMitarbeiter, getRollen, getBonusUebersicht } from '@/api/admin';
import { authApi } from '@/api/auth';
import type { Mitarbeiter, BonusUebersicht } from '@/types';

// ─── Inline-Edit-Zelle ────────────────────────────────────────────────────────

interface InlineNumberProps {
  value:      number;
  onSave:     (n: number) => Promise<void>;
  min?:       number;
  max?:       number;
  saving?:    boolean;
}

function InlineNumber({ value, onSave, min = 0, max = 365, saving }: InlineNumberProps) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);

  const commit = async () => {
    if (draft !== value) await onSave(draft);
    setEditing(false);
  };

  if (saving) return <span className="text-gray-300 animate-pulse">{value}</span>;

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        className="text-left font-medium text-gray-700 hover:text-info-600 underline-offset-2 hover:underline transition-colors"
      >
        {value}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="w-16 px-2 py-0.5 text-sm border border-info-400 rounded focus:outline-none focus:ring-1 focus:ring-info-500"
        autoFocus
      />
      <button onClick={commit} className="text-bonus-600 hover:text-bonus-700 text-xs font-medium">✓</button>
      <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
    </div>
  );
}

// ─── Rollen-Select ────────────────────────────────────────────────────────────

function RolleSelect({
  rolleId,
  rollen,
  onSave,
  saving,
}: {
  rolleId: number;
  rollen:  { id: number; bezeichnung: string; faktor: number }[];
  onSave:  (id: number) => Promise<void>;
  saving?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const aktuelle = rollen.find((r) => r.id === rolleId);

  if (saving) return <span className="text-gray-300 animate-pulse">{aktuelle?.bezeichnung}</span>;

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-left text-gray-700 hover:text-info-600 underline-offset-2 hover:underline transition-colors"
      >
        {aktuelle?.bezeichnung ?? '—'} <span className="text-gray-400 text-xs">(×{Number(aktuelle?.faktor).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })})</span>
      </button>
    );
  }

  return (
    <select
      defaultValue={rolleId}
      autoFocus
      onBlur={(e) => { onSave(Number(e.target.value)); setEditing(false); }}
      onChange={(e) => { onSave(Number(e.target.value)); setEditing(false); }}
      className="text-sm border border-info-400 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-info-500"
    >
      {rollen.map((r) => (
        <option key={r.id} value={r.id}>{r.bezeichnung} (×{Number(r.faktor).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })})</option>
      ))}
    </select>
  );
}

// ─── Präferenz-Toggle ────────────────────────────────────────────────────────

function PraeferenzToggle({
  praeferenz,
  onSave,
  saving,
}: {
  praeferenz: 'geld' | 'freizeit';
  onSave:     (p: 'geld' | 'freizeit') => Promise<void>;
  saving?:    boolean;
}) {
  return (
    <div className="flex gap-1">
      {(['geld', 'freizeit'] as const).map((p) => (
        <button
          key={p}
          disabled={saving}
          onClick={() => onSave(p)}
          className={`px-2 py-0.5 text-xs rounded-full font-medium transition-colors ${
            praeferenz === p
              ? p === 'geld' ? 'bg-bonus-100 text-bonus-700' : 'bg-info-100 text-info-700'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
          }`}
        >
          {p === 'geld' ? '€' : '🕐'} {p}
        </button>
      ))}
    </div>
  );
}

// ─── Stundenlohn-Zelle (Decimal, kann null sein) ─────────────────────────────

function StundenlohnCell({
  wert,
  maId,
  onSave,
  saving,
}: {
  // Prisma serialisiert Decimal als String → beide Typen müssen behandelt werden
  wert:   number | string | null;
  maId:   number;
  onSave: (id: number, wert: number | null) => Promise<void>;
  saving?: boolean;
}) {
  const numWert = wert === null || wert === undefined ? null : Number(wert);
  const wertGueltig = numWert !== null && !isNaN(numWert);

  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(wertGueltig ? String(numWert) : '');

  const commit = async () => {
    const trimmed = draft.trim();
    const neu = trimmed === '' ? null : Number(trimmed);
    if (neu !== null && (isNaN(neu) || neu < 0)) return;
    if (neu !== numWert) await onSave(maId, neu);
    setEditing(false);
  };

  if (saving) {
    return <span className="text-gray-300 animate-pulse">{wertGueltig ? `${numWert!.toFixed(2)} €` : '—'}</span>;
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(wertGueltig ? String(numWert) : ''); setEditing(true); }}
        className={`text-left underline-offset-2 hover:underline transition-colors ${
          !wertGueltig
            ? 'text-malus-600 italic hover:text-malus-700'
            : 'text-gray-700 hover:text-info-600'
        }`}
        title={!wertGueltig ? 'Pflicht für § 4a EFZG-Schutz — klicken zum Setzen' : 'Klicken zum Bearbeiten'}
      >
        {wertGueltig ? `${numWert!.toFixed(2)} €` : 'fehlt!'}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        step={0.01}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        placeholder="0,00"
        className="w-20 px-2 py-0.5 text-sm border border-info-400 rounded focus:outline-none focus:ring-1 focus:ring-info-500"
        autoFocus
      />
      <span className="text-xs text-gray-400">€</span>
      <button onClick={commit} className="text-bonus-600 hover:text-bonus-700 text-xs font-medium">✓</button>
      <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
    </div>
  );
}

// ─── Kranktage-Badge ─────────────────────────────────────────────────────────

function KranktageCell({
  tage,
  schwelle,
  maId,
  onSave,
  saving,
}: {
  tage:    number;
  schwelle: number;
  maId:    number;
  onSave:  (id: number, tage: number) => Promise<void>;
  saving?: boolean;
}) {
  const proz = schwelle > 0 ? (tage / schwelle) * 100 : 0;
  const warn  = proz >= 80;
  const krit  = proz >= 100;

  return (
    <div className="flex items-center gap-2">
      <InlineNumber
        value={tage}
        onSave={(n) => onSave(maId, n)}
        max={365}
        saving={saving}
      />
      {krit && <Badge variant="malus" dot>Limit!</Badge>}
      {!krit && warn && <Badge variant="grenz" dot>Warnung</Badge>}
    </div>
  );
}

// ─── Passwort-Setzen-Modal ────────────────────────────────────────────────────

function PasswortSetzenModal({
  ma,
  onClose,
  onToast,
}: {
  ma:      Mitarbeiter;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [passwort,      setPasswort]      = useState('');
  const [wiederholung,  setWiederholung]  = useState('');
  const [zeig1,         setZeig1]         = useState(false);
  const [zeig2,         setZeig2]         = useState(false);
  const [laden,         setLaden]         = useState(false);
  const [fehler,        setFehler]        = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    if (passwort.length < 6) { setFehler('Mindestens 6 Zeichen'); return; }
    if (passwort !== wiederholung) { setFehler('Passwörter stimmen nicht überein'); return; }
    setLaden(true);
    try {
      await authApi.setMitarbeiterPasswort(ma.id, passwort);
      onToast(`Passwort für ${ma.vorname} ${ma.nachname} gesetzt ✓`);
      onClose();
    } catch {
      setFehler('Fehler beim Setzen des Passworts');
    } finally {
      setLaden(false);
    }
  }

  const fieldClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500 bg-white';

  return (
    <Modal
      title={`Passwort setzen – ${ma.vorname} ${ma.nachname}`}
      onClose={onClose}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-gray-500">
          Gib ein neues Passwort für diesen Mitarbeiter ein. Der Mitarbeiter kann sich damit bei{' '}
          <span className="font-medium text-gray-700">Mein Bonus</span> anmelden.
        </p>

        {fehler && (
          <div className="px-3 py-2 rounded-lg bg-malus-50 border border-malus-200 text-xs text-malus-700">
            {fehler}
          </div>
        )}

        {/* Neues Passwort */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Neues Passwort</label>
          <div className="relative">
            <input
              type={zeig1 ? 'text' : 'password'}
              required
              value={passwort}
              onChange={(e) => setPasswort(e.target.value)}
              className={`${fieldClass} pr-10`}
              placeholder="Mindestens 6 Zeichen"
              autoFocus
            />
            <button type="button" onClick={() => setZeig1((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-400 hover:text-gray-600">
              {zeig1 ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Wiederholung */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Passwort bestätigen</label>
          <div className="relative">
            <input
              type={zeig2 ? 'text' : 'password'}
              required
              value={wiederholung}
              onChange={(e) => setWiederholung(e.target.value)}
              className={`${fieldClass} pr-10`}
              placeholder="Passwort wiederholen"
            />
            <button type="button" onClick={() => setZeig2((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-400 hover:text-gray-600">
              {zeig2 ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Aktionen */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={laden}>Abbrechen</Button>
          <Button variant="primary" size="sm" type="submit" loading={laden}>Passwort setzen</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function AdminMitarbeiter() {
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [rollen,      setRollen]      = useState<{ id: number; bezeichnung: string; faktor: number }[]>([]);
  const [bonus,       setBonus]       = useState<BonusUebersicht | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [fehler,      setFehler]      = useState<string | null>(null);
  const [saving,         setSaving]         = useState<Set<number>>(new Set());
  const [suche,          setSuche]          = useState('');
  const [statusMsg,      setStatusMsg]      = useState<string | null>(null);
  const [passwortFuerMA, setPasswortFuerMA] = useState<Mitarbeiter | null>(null);

  const jahr = new Date().getFullYear();

  // Standard-Schwellenwert (wird aus Bonus-Übersicht genommen — alle MA haben denselben Wert aus Konfiguration)
  const schwelle = 25; // Fallback; wird nicht verwendet für Anzeige

  const laden = useCallback(async () => {
    setLoading(true);
    setFehler(null);
    try {
      const [ma, r, b] = await Promise.all([
        getMitarbeiterListe(),
        getRollen(),
        getBonusUebersicht(jahr),
      ]);
      setMitarbeiter(ma);
      setRollen(r);
      setBonus(b);
    } catch {
      setFehler('Daten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [jahr]);

  useEffect(() => { laden(); }, [laden]);

  const toast = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const withSaving = async (id: number, fn: () => Promise<Mitarbeiter>) => {
    setSaving((prev) => new Set(prev).add(id));
    try {
      const updated = await fn();
      setMitarbeiter((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      toast('Gespeichert ✓');
    } catch {
      toast('Fehler beim Speichern');
    } finally {
      setSaving((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const saveKranktage     = (id: number, tage: number)            => withSaving(id, () => patchMitarbeiter(id, { kranktageAktuellesJahr: tage }));
  const saveRolle         = (id: number, rolleId: number)         => withSaving(id, () => patchMitarbeiter(id, { rolleId }));
  const savePraeferenz    = (id: number, p: 'geld' | 'freizeit')  => withSaving(id, () => patchMitarbeiter(id, { auszahlungspraeferenz: p }));
  const saveStundenlohn   = (id: number, wert: number | null)     => withSaving(id, () => patchMitarbeiter(id, { stundenlohnBrutto: wert }));

  const gefiltert = mitarbeiter.filter((m) =>
    !suche ||
    `${m.vorname} ${m.nachname}`.toLowerCase().includes(suche.toLowerCase()) ||
    String(m.id).includes(suche),
  );

  const sortiert = [...gefiltert].sort((a, b) => {
    const gruppe = (m: typeof a) => {
      if (!m.aktiv) return 2;
      return bonusFuer(m.id)?.qualifiziert ? 0 : 1;
    };
    return gruppe(a) - gruppe(b);
  });

  // Bonus-Betrag je MA aus Übersicht
  function bonusFuer(id: number) {
    return bonus?.mitarbeiter.find((b) => b.mitarbeiterId === id);
  }

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
      {/* Passwort-setzen-Modal */}
      {passwortFuerMA && (
        <PasswortSetzenModal
          ma={passwortFuerMA}
          onClose={() => setPasswortFuerMA(null)}
          onToast={toast}
        />
      )}

      {/* Status-Toast */}
      {statusMsg && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm shadow-card animate-fadeIn">
          {statusMsg}
        </div>
      )}

      {/* Suche + Statistik */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-3">
          <Badge variant="info">{mitarbeiter.length} gesamt</Badge>
          <Badge variant="bonus">{bonus?.anzahlQualifiziert ?? 0} qualifiziert</Badge>
          <Badge variant="malus">{bonus?.anzahlNichtQualifiziert ?? 0} nicht qualifiziert</Badge>
        </div>
        <input
          type="text"
          placeholder="Name oder ID suchen…"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          className="w-full sm:w-64 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500"
        />
      </div>

      {/* Tabelle */}
      <Card>
        <CardHeader>
          <CardTitle>Mitarbeiter ({gefiltert.length})</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4 hidden sm:table-cell">Rolle</th>
                <th className="py-2 pr-4 hidden lg:table-cell">Kranktage</th>
                <th className="py-2 pr-4 hidden xl:table-cell" title="Brutto-Stundenlohn für § 4a EFZG-Cap">Std.lohn</th>
                <th className="py-2 pr-4 hidden lg:table-cell">Präferenz</th>
                <th className="py-2 pr-4 text-right">Bonus {new Date().getFullYear()}</th>
                <th className="py-2 text-center hidden sm:table-cell">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortiert.map((ma) => {
                const b          = bonusFuer(ma.id);
                const isSaving   = saving.has(ma.id);

                return (
                  <tr key={ma.id} className={`transition-colors ${isSaving ? 'opacity-60' : 'hover:bg-gray-50'}`}>
                    {/* Name */}
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium text-gray-800">
                            {ma.vorname} {ma.nachname}
                          </p>
                          <p className="text-xs text-gray-400">ID {ma.id}</p>
                        </div>
                        <button
                          type="button"
                          title="Passwort setzen"
                          onClick={() => setPasswortFuerMA(ma)}
                          className="ml-1 p-1 rounded-lg text-gray-300 hover:text-info-600 hover:bg-info-50 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/>
                          </svg>
                        </button>
                      </div>
                    </td>

                    {/* Rolle (inline edit) */}
                    <td className="py-3 pr-4 hidden sm:table-cell">
                      <RolleSelect
                        rolleId={ma.rolleId}
                        rollen={rollen}
                        onSave={(id) => saveRolle(ma.id, id)}
                        saving={isSaving}
                      />
                    </td>

                    {/* Kranktage (inline edit) */}
                    <td className="py-3 pr-4 hidden lg:table-cell">
                      <KranktageCell
                        tage={ma.kranktageAktuellesJahr}
                        schwelle={schwelle}
                        maId={ma.id}
                        onSave={saveKranktage}
                        saving={isSaving}
                      />
                    </td>

                    {/* Stundenlohn (für EFZG-Cap) */}
                    <td className="py-3 pr-4 hidden xl:table-cell">
                      <StundenlohnCell
                        wert={ma.stundenlohnBrutto}
                        maId={ma.id}
                        onSave={saveStundenlohn}
                        saving={isSaving}
                      />
                    </td>

                    {/* Präferenz */}
                    <td className="py-3 pr-4 hidden lg:table-cell">
                      <PraeferenzToggle
                        praeferenz={ma.auszahlungspraeferenz}
                        onSave={(p) => savePraeferenz(ma.id, p)}
                        saving={isSaving}
                      />
                    </td>

                    {/* Bonus */}
                    <td className="py-3 pr-4 text-right">
                      {b ? (
                        <span className="font-semibold text-bonus-700">
                          {b.gesamtBetrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 text-center hidden sm:table-cell">
                      {b ? (
                        <Badge variant={b.qualifiziert ? 'bonus' : 'malus'} dot>
                          {b.qualifiziert ? 'qualifiziert' : 'nicht qual.'}
                        </Badge>
                      ) : (
                        <Badge variant="neutral">keine Daten</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {gefiltert.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400">Keine Mitarbeiter gefunden</p>
            </div>
          )}
        </div>
      </Card>

      {/* Legende */}
      <Card>
        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-bonus-500" />
            Qualifiziert = mind. Betriebszugehörigkeit + Kranktage unter Schwelle
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-grenz-500" />
            Warnung = Kranktage ≥ 80% des Schwellenwerts
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-malus-500" />
            Limit = Kranktage erreichen Schwellenwert
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-malus-400" />
            Stundenlohn „fehlt!" = § 4a EFZG-Schutz kann nicht angewendet werden
          </div>
          <p className="text-gray-400">Klick auf Zelle zum Inline-Bearbeiten</p>
        </div>
      </Card>
    </div>
  );
}
