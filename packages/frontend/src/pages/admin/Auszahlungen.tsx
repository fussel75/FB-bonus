/**
 * Admin — Auszahlungsprotokoll
 *
 * Status-Workflow: ausstehend → genehmigt → ausgezahlt
 * Bulk-Genehmigung, Stornierung, Zahlungsnachweis
 */

import { useState, useCallback, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import {
  getAuszahlungen,
  genehmigeAuszahlung,
  ausgezahltAuszahlung,
  storniereAuszahlung,
  bulkGenehmigeAuszahlungen,
} from '@/api/admin';
import type { Auszahlung, AuszahlungStatus } from '@/types';

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function statusVariant(s: AuszahlungStatus) {
  return s === 'ausgezahlt' ? 'bonus' : s === 'genehmigt' ? 'info' : s === 'storniert' ? 'malus' : 'neutral';
}

function statusLabel(s: AuszahlungStatus) {
  const m: Record<AuszahlungStatus, string> = {
    ausstehend: 'Ausstehend',
    genehmigt:  'Genehmigt',
    ausgezahlt: 'Ausgezahlt',
    storniert:  'Storniert',
  };
  return m[s];
}

function eur(n: number) {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function formatDatum(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'short' });
}

// ─── Auszahlungs-Modal (Markieren als ausgezahlt) ─────────────────────────────

function AusgezahltModal({
  auszahlung,
  onConfirm,
  onClose,
}: {
  auszahlung: Auszahlung;
  onConfirm: (nachweis?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [nachweis, setNachweis] = useState('');
  const [saving,   setSaving]   = useState(false);

  const handle = async () => {
    setSaving(true);
    try { await onConfirm(nachweis || undefined); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="Als ausgezahlt markieren" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Auszahlung für <strong>{auszahlung.mitarbeiter.vorname} {auszahlung.mitarbeiter.nachname}</strong>{' '}
          über <strong>{eur(auszahlung.betragGesamt)}</strong> als ausgezahlt kennzeichnen?
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Zahlungsnachweis / Referenz (optional)
          </label>
          <input
            type="text"
            value={nachweis}
            onChange={(e) => setNachweis(e.target.value)}
            placeholder="z.B. Überweisungsnr., Datum…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-bonus-500"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Abbrechen</Button>
          <Button variant="success" size="sm" onClick={handle} loading={saving}>
            Ausgezahlt bestätigen
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Auszahlungszeile ────────────────────────────────────────────────────────

interface AuszahlungZeileProps {
  a:           Auszahlung;
  selected:    boolean;
  onSelect:    (id: number) => void;
  onAction:    (action: 'genehmigen' | 'ausgezahlt' | 'stornieren', id: number) => void;
  actioning:   Set<number>;
}

function AuszahlungZeile({ a, selected, onSelect, onAction, actioning }: AuszahlungZeileProps) {
  const busy = actioning.has(a.id);

  return (
    <tr className={`transition-colors ${busy ? 'opacity-60' : 'hover:bg-gray-50'}`}>
      {/* Checkbox */}
      <td className="py-3 pl-4 pr-3">
        {a.status === 'ausstehend' && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect(a.id)}
            className="w-4 h-4 rounded border-gray-300 text-bonus-600 focus:ring-bonus-500"
          />
        )}
      </td>

      {/* Name */}
      <td className="py-3 pr-4">
        <p className="font-medium text-gray-800">
          {a.mitarbeiter.vorname} {a.mitarbeiter.nachname}
        </p>
        <p className="text-xs text-gray-400">ID {a.mitarbeiterId} · {a.kalenderjahr}</p>
      </td>

      {/* Beträge */}
      <td className="py-3 pr-4 text-right">
        <div>
          <p className="font-semibold text-gray-800">{eur(a.betragGesamt)}</p>
          <p className="text-xs text-gray-400">
            A: {eur(a.betragOptionA)} · B: {eur(a.betragOptionB)}
          </p>
        </div>
      </td>

      {/* Präferenz */}
      <td className="py-3 pr-4 text-center">
        <Badge variant={a.mitarbeiter.auszahlungspraeferenz === 'geld' ? 'bonus' : 'info'}>
          {a.mitarbeiter.auszahlungspraeferenz === 'geld' ? '€ Geld' : '🕐 Freizeit'}
        </Badge>
      </td>

      {/* Status */}
      <td className="py-3 pr-4 text-center">
        <Badge variant={statusVariant(a.status)} dot>
          {statusLabel(a.status)}
        </Badge>
        {a.genehmigtAm && (
          <p className="text-xs text-gray-400 mt-0.5">genehmigt {formatDatum(a.genehmigtAm)}</p>
        )}
        {a.ausgezahltAm && (
          <p className="text-xs text-gray-400 mt-0.5">ausgezahlt {formatDatum(a.ausgezahltAm)}</p>
        )}
      </td>

      {/* Aktionen */}
      <td className="py-3 text-right">
        <div className="flex gap-1 justify-end">
          {a.status === 'ausstehend' && (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => onAction('genehmigen', a.id)}
                loading={busy}
              >
                Genehmigen
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => onAction('stornieren', a.id)}
                loading={busy}
              >
                Stornieren
              </Button>
            </>
          )}
          {a.status === 'genehmigt' && (
            <>
              <Button
                variant="success"
                size="sm"
                onClick={() => onAction('ausgezahlt', a.id)}
                loading={busy}
              >
                Ausgezahlt
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => onAction('stornieren', a.id)}
                loading={busy}
              >
                Stornieren
              </Button>
            </>
          )}
          {(a.status === 'ausgezahlt' || a.status === 'storniert') && (
            <span className="text-xs text-gray-400 px-2 py-1">abgeschlossen</span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function AdminAuszahlungen() {
  const [auszahlungen,  setAuszahlungen]  = useState<Auszahlung[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [fehler,        setFehler]        = useState<string | null>(null);
  const [actioning,     setActioning]     = useState<Set<number>>(new Set());
  const [selected,      setSelected]      = useState<Set<number>>(new Set());
  const [statusFilter,  setStatusFilter]  = useState<AuszahlungStatus | 'alle'>('alle');
  const [ausgezahltId,  setAusgezahltId]  = useState<number | null>(null);
  const [stornierId,    setStornierId]    = useState<number | null>(null);
  const [bulkConfirm,   setBulkConfirm]  = useState(false);
  const [toast,         setToast]         = useState<string | null>(null);

  const jahr = new Date().getFullYear();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const laden = useCallback(async () => {
    setLoading(true);
    setFehler(null);
    try {
      const data = await getAuszahlungen(jahr);
      setAuszahlungen(data);
    } catch {
      setFehler('Auszahlungen konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [jahr]);

  useEffect(() => { laden(); }, [laden]);

  // Einzelne Aktion ausführen
  const handleAction = async (action: 'genehmigen' | 'ausgezahlt' | 'stornieren', id: number) => {
    if (action === 'ausgezahlt') { setAusgezahltId(id); return; }
    if (action === 'stornieren') { setStornierId(id);   return; }

    setActioning((prev) => new Set(prev).add(id));
    try {
      const updated = await genehmigeAuszahlung(id);
      setAuszahlungen((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
      setSelected((prev) => { const s = new Set(prev); s.delete(id); return s; });
      showToast('Genehmigt ✓');
    } catch {
      showToast('Fehler beim Genehmigen');
    } finally {
      setActioning((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleAusgezahlt = async (nachweis?: string) => {
    if (!ausgezahltId) return;
    setActioning((prev) => new Set(prev).add(ausgezahltId));
    try {
      const updated = await ausgezahltAuszahlung(ausgezahltId, nachweis);
      setAuszahlungen((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
      showToast('Als ausgezahlt markiert ✓');
    } catch {
      showToast('Fehler');
    } finally {
      setActioning((prev) => { const s = new Set(prev); s.delete(ausgezahltId!); return s; });
      setAusgezahltId(null);
    }
  };

  const handleStornieren = async () => {
    if (!stornierId) return;
    setActioning((prev) => new Set(prev).add(stornierId));
    try {
      const updated = await storniereAuszahlung(stornierId);
      setAuszahlungen((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
      showToast('Storniert');
    } catch {
      showToast('Fehler beim Stornieren');
    } finally {
      setActioning((prev) => { const s = new Set(prev); s.delete(stornierId!); return s; });
      setStornierId(null);
    }
  };

  const handleBulkGenehmigen = async () => {
    const ids = Array.from(selected);
    setBulkConfirm(false);
    ids.forEach((id) => setActioning((prev) => new Set(prev).add(id)));
    try {
      const result = await bulkGenehmigeAuszahlungen(ids);
      await laden();
      setSelected(new Set());
      showToast(`${result.aktualisiert} Auszahlungen genehmigt ✓`);
    } catch {
      showToast('Fehler bei Bulk-Genehmigung');
    } finally {
      ids.forEach((id) => setActioning((prev) => { const s = new Set(prev); s.delete(id); return s; }));
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleAll = () => {
    const ausstehende = gefiltert.filter((a) => a.status === 'ausstehend').map((a) => a.id);
    if (ausstehende.every((id) => selected.has(id))) {
      setSelected((prev) => { const s = new Set(prev); ausstehende.forEach((id) => s.delete(id)); return s; });
    } else {
      setSelected((prev) => { const s = new Set(prev); ausstehende.forEach((id) => s.add(id)); return s; });
    }
  };

  const gefiltert = auszahlungen.filter((a) =>
    statusFilter === 'alle' || a.status === statusFilter,
  );

  // Kennzahlen
  const summeGesamt    = auszahlungen.reduce((s, a) => s + a.betragGesamt, 0);
  const ausstehendAnz  = auszahlungen.filter((a) => a.status === 'ausstehend').length;
  const ausgezahltAnz  = auszahlungen.filter((a) => a.status === 'ausgezahlt').length;

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

  const ausgezahltModalData = ausgezahltId
    ? auszahlungen.find((a) => a.id === ausgezahltId) ?? null
    : null;

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm shadow-card animate-fadeIn">
          {toast}
        </div>
      )}

      {/* Kennzahlen */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { l: 'Gesamtvolumen',   v: eur(summeGesamt),     c: 'text-bonus-700' },
          { l: 'Ausstehend',      v: String(ausstehendAnz), c: 'text-grenz-700' },
          { l: 'Ausgezahlt',      v: String(ausgezahltAnz), c: 'text-gray-700'  },
        ].map(({ l, v, c }) => (
          <Card key={l}>
            <p className="text-xs text-gray-400 uppercase tracking-wide">{l}</p>
            <p className={`text-xl font-bold ${c}`}>{v}</p>
          </Card>
        ))}
      </div>

      {/* Filter + Bulk-Aktion */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          {/* Statusfilter */}
          <div className="flex flex-wrap gap-2">
            {(['alle', 'ausstehend', 'genehmigt', 'ausgezahlt', 'storniert'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s === 'alle' ? 'Alle' : statusLabel(s as AuszahlungStatus)}
              </button>
            ))}
          </div>
          {/* Bulk-Button */}
          {selected.size > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setBulkConfirm(true)}
            >
              {selected.size} Auszahlungen genehmigen
            </Button>
          )}
        </div>
      </Card>

      {/* Tabelle */}
      <Card>
        <CardHeader>
          <CardTitle>Auszahlungen {jahr} ({gefiltert.length})</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 pl-4 pr-3">
                  <input
                    type="checkbox"
                    onChange={toggleAll}
                    checked={
                      gefiltert.filter((a) => a.status === 'ausstehend').length > 0 &&
                      gefiltert.filter((a) => a.status === 'ausstehend').every((a) => selected.has(a.id))
                    }
                    className="w-4 h-4 rounded border-gray-300 text-bonus-600 focus:ring-bonus-500"
                  />
                </th>
                <th className="py-2 pr-4">Mitarbeiter</th>
                <th className="py-2 pr-4 text-right">Betrag</th>
                <th className="py-2 pr-4 text-center">Präferenz</th>
                <th className="py-2 pr-4 text-center">Status</th>
                <th className="py-2 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {gefiltert.map((a) => (
                <AuszahlungZeile
                  key={a.id}
                  a={a}
                  selected={selected.has(a.id)}
                  onSelect={toggleSelect}
                  onAction={handleAction}
                  actioning={actioning}
                />
              ))}
            </tbody>
          </table>
          {gefiltert.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400">Keine Auszahlungen gefunden</p>
            </div>
          )}
        </div>
      </Card>

      {/* Modals */}
      {ausgezahltModalData && (
        <AusgezahltModal
          auszahlung={ausgezahltModalData}
          onConfirm={handleAusgezahlt}
          onClose={() => setAusgezahltId(null)}
        />
      )}

      {stornierId && (
        <ConfirmModal
          title="Auszahlung stornieren?"
          message="Diese Aktion kann nicht rückgängig gemacht werden."
          confirmLabel="Stornieren"
          variant="danger"
          onConfirm={handleStornieren}
          onCancel={() => setStornierId(null)}
        />
      )}

      {bulkConfirm && (
        <ConfirmModal
          title={`${selected.size} Auszahlungen genehmigen?`}
          message="Alle ausgewählten Auszahlungen werden als genehmigt markiert."
          confirmLabel="Alle genehmigen"
          variant="primary"
          onConfirm={handleBulkGenehmigen}
          onCancel={() => setBulkConfirm(false)}
        />
      )}
    </div>
  );
}
