/**
 * Mitarbeiter-Einstellungen
 *
 * - Auszahlungspräferenz umschalten (Geld / Freizeitausgleich)
 * - Eigene Stammdaten anzeigen (Name, Rolle, Eintrittsdatum)
 */

import { useState } from 'react';
import { useFetch } from '@/hooks/useFetch';
import { mitarbeiterApi } from '@/api/mitarbeiter';
import { extractApiError } from '@/api/client';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SkeletonText } from '@/components/ui/Skeleton';

// ─── Toggle-Schalter ──────────────────────────────────────────────────────────

function PraeferenzToggle({
  value,
  onChange,
  loading,
}: {
  value:    'geld' | 'freizeit';
  onChange: (v: 'geld' | 'freizeit') => void;
  loading:  boolean;
}) {
  return (
    <div className="flex rounded-xl border border-gray-200 overflow-hidden">
      {(['geld', 'freizeit'] as const).map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            onClick={() => !loading && onChange(opt)}
            disabled={loading}
            className={[
              'flex-1 py-3 px-4 text-sm font-medium transition-colors duration-200',
              active
                ? 'bg-info-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50',
              loading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            <span className="flex items-center justify-center gap-2">
              {opt === 'geld' ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
              )}
              {opt === 'geld' ? 'Geldauszahlung' : 'Freizeitausgleich'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Stammdaten-Zeile ─────────────────────────────────────────────────────────

function DatenZeile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0 gap-4">
      <span className="text-sm text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function Einstellungen() {
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState(false);
  const [fehler,  setFehler]  = useState<string | null>(null);

  const { data: me, loading, refresh } = useFetch(() => mitarbeiterApi.getMe(), []);

  const [praeferenz, setPraeferenz] = useState<'geld' | 'freizeit'>(
    me?.auszahlungspraeferenz ?? 'geld',
  );

  // Wenn Daten geladen → lokalen State synchronisieren
  if (me && praeferenz !== me.auszahlungspraeferenz && !saving) {
    setPraeferenz(me.auszahlungspraeferenz);
  }

  async function handlePraeferenzChange(neueWahl: 'geld' | 'freizeit') {
    if (neueWahl === praeferenz) return;
    setPraeferenz(neueWahl);
    setSaving(true);
    setFehler(null);
    setSuccess(false);

    try {
      await mitarbeiterApi.setPraeferenz(neueWahl);
      setSuccess(true);
      refresh();
      setTimeout(() => setSuccess(false), 2500);
    } catch (err) {
      setFehler(extractApiError(err));
      setPraeferenz(me?.auszahlungspraeferenz ?? 'geld'); // Rollback
    } finally {
      setSaving(false);
    }
  }

  const eintrittsdatum = me?.eintrittsdatum
    ? new Date(me.eintrittsdatum).toLocaleDateString('de-DE', {
        day: '2-digit', month: 'long', year: 'numeric',
      })
    : '–';

  return (
    <div className="space-y-4 animate-fadeIn max-w-lg">

      {/* ── Auszahlungspräferenz ─────────────────────────────────────────────── */}
      <Card padding="md">
        <CardHeader>
          <CardTitle>Auszahlungspräferenz</CardTitle>
          {success && (
            <Badge variant="bonus" dot>Gespeichert</Badge>
          )}
        </CardHeader>

        <p className="text-sm text-gray-500 mb-4">
          Wie möchtest du deinen Bonus erhalten?
        </p>

        {loading ? (
          <div className="h-12 rounded-xl bg-gray-100 animate-pulse_soft" />
        ) : (
          <PraeferenzToggle
            value={praeferenz}
            onChange={handlePraeferenzChange}
            loading={saving}
          />
        )}

        {fehler && (
          <p className="mt-2 text-xs text-malus-600 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
            </svg>
            {fehler}
          </p>
        )}

        {/* Erläuterung */}
        <div className="mt-4 p-3 bg-info-50 rounded-lg border border-info-100">
          <p className="text-xs text-info-700 leading-relaxed">
            {praeferenz === 'geld'
              ? '💶 Der Bonusbetrag wird zum Auszahlungsstichtag auf dein Konto überwiesen.'
              : '🏖️ Dein Bonus wird in Freizeit umgerechnet. Details werden mit deinem Vorgesetzten abgestimmt.'}
          </p>
        </div>
      </Card>

      {/* ── Persönliche Daten ────────────────────────────────────────────────── */}
      <Card padding="md">
        <CardHeader>
          <CardTitle>Meine Daten</CardTitle>
        </CardHeader>

        {loading ? (
          <SkeletonText lines={4} />
        ) : me ? (
          <div>
            <DatenZeile label="Name"          value={`${me.vorname} ${me.nachname}`} />
            <DatenZeile label="Funktion"      value={me.rolle.bezeichnung} />
            <DatenZeile label="Rollenfaktor"  value={`× ${Number(me.rolle.faktor).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`} />
            <DatenZeile label="Im Unternehmen seit" value={eintrittsdatum} />
            <DatenZeile label="Mitarbeiter-ID" value={String(me.id)} />
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">Daten konnten nicht geladen werden</p>
        )}
      </Card>

      {/* ── Rechtlicher Hinweis ──────────────────────────────────────────────── */}
      <Card padding="md">
        <CardHeader>
          <CardTitle>Hinweise</CardTitle>
        </CardHeader>
        <div className="space-y-2 text-xs text-gray-500 leading-relaxed">
          <p>
            Die angezeigten Bonusbeträge sind <strong className="text-gray-700">vorläufige Hochrechnungen</strong>.
            Der endgültige Betrag wird am Jahresstichtag berechnet.
          </p>
          <p>
            Voraussetzungen für den Bonusanspruch: Mindestbetriebszugehörigkeit und
            Einhaltung des Kranktage-Limits. Bei Nichteinhaltung verfällt der Anspruch
            — kein Abzug vom Lohn.
          </p>
        </div>
      </Card>
    </div>
  );
}
