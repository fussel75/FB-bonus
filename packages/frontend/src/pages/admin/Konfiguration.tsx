/**
 * Admin — Konfigurationsseite
 *
 * - Alle Parameter als Formularfelder mit Beschreibung
 * - Live-Vorschau bei Stundensatz-Änderungen
 * - API-Key setzen (separater Bereich, Superadmin)
 * - Änderungsprotokoll
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SkeletonCard } from '@/components/ui/Skeleton';
import {
  getKonfiguration, putKonfiguration, putApiKey, getKonfigLog, uploadLogo,
  getRollen, createRolle, updateRolle, deleteRolle,
  getProjekteListe, toggleBonusAusschluss,
  type KonfigLogEintrag, type Rolle, type ProjektMitStunden,
} from '@/api/admin';
import { useAuth } from '@/context/AuthContext';
import type { KonfigWerte } from '@/types';

// ─── Konfigurationsfelder-Metadaten ──────────────────────────────────────────

interface KonfigMeta {
  key:         keyof KonfigWerte;
  label:       string;
  beschreibung: string;
  typ:         'number' | 'text' | 'cron' | 'url';
  einheit?:    string;
  readonly?:   boolean;
}

const FELDER: KonfigMeta[] = [
  {
    key:         'stundensatz_option_b',
    label:       'Stundensatz Option B',
    beschreibung: 'Auszahlungssatz in € pro Überschuss-Stunde (Jahresbonus)',
    typ:         'number',
    einheit:     '€/h',
  },
  {
    key:         'stundensatz_option_a',
    label:       'Stundensatz Option A',
    beschreibung: 'Satz für manuelle Zusatzstunden-Buchungen',
    typ:         'number',
    einheit:     '€/h',
  },
  {
    key:         'mindest_betriebszugehoerigkeit_monate',
    label:       'Mindest-Betriebszugehörigkeit',
    beschreibung: 'Wie viele Monate muss ein MA mindestens im Unternehmen sein?',
    typ:         'number',
    einheit:     'Monate',
  },
  {
    key:         'rollenfaktor_min',
    label:       'Minimaler Rollenfaktor',
    beschreibung: 'Untergrenze für alle Rollen-Faktoren (verhindert Nullwerte)',
    typ:         'number',
    einheit:     'Faktor',
  },
  {
    key:         'auszahlungsstichtag',
    label:       'Auszahlungs-Stichtag',
    beschreibung: 'Datum bis zu dem der Jahresabschluss eingereicht werden soll (z.B. 31.03.)',
    typ:         'text',
  },
  {
    key:         'unternehmensname',
    label:       'Unternehmensname',
    beschreibung: 'Wird im Bericht und in der App angezeigt',
    typ:         'text',
  },
  {
    key:         'unternehmens_logo_url',
    label:       'Logo-URL',
    beschreibung: 'URL zum Firmenlogo (wird im PDF-Export verwendet)',
    typ:         'url',
  },
  {
    key:         'api_endpoint_url',
    label:       'API-Endpunkt URL',
    beschreibung: 'URL der externen REST-API für den Stunden-Sync',
    typ:         'url',
  },
  {
    key:         'sync_cron_ausdruck',
    label:       'Sync-Intervall (Cron)',
    beschreibung: 'Cron-Ausdruck für den automatischen Sync (z.B. "0 6 * * *" = täglich 6 Uhr)',
    typ:         'cron',
  },
  {
    key:         'sync_cron_ausdruck_aktiv',
    label:       'Aktiver Cron-Ausdruck',
    beschreibung: 'Derzeit laufender Cron-Ausdruck (schreibgeschützt — ändert sich beim nächsten Neustart)',
    typ:         'text',
    readonly:    true,
  },
];

// ─── Einzel-Konfigfeld ────────────────────────────────────────────────────────

function KonfigFeld({
  meta,
  wert,
  onSave,
}: {
  meta:   KonfigMeta;
  wert:   string;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [draft,      setDraft]      = useState(wert);
  const [saving,     setSaving]     = useState(false);
  const [success,    setSuccess]    = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [uploadErr,  setUploadErr]  = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = draft !== wert;
  const isLogoFeld = meta.key === 'unternehmens_logo_url';

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(meta.key, draft);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadErr(null);
    try {
      const url = await uploadLogo(file);
      await onSave(meta.key, url);
      setDraft(url);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch {
      setUploadErr('Upload fehlgeschlagen. Bitte nochmal versuchen.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-gray-700">{meta.label}</label>
        {meta.einheit && (
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{meta.einheit}</span>
        )}
      </div>
      <p className="text-xs text-gray-400">{meta.beschreibung}</p>

      {/* Logo-Vorschau */}
      {isLogoFeld && draft && (
        <img
          src={draft}
          alt="Logo-Vorschau"
          className="h-12 object-contain rounded border border-gray-100 bg-gray-50 p-1"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}

      <div className="flex gap-2">
        <input
          type={meta.typ === 'number' ? 'number' : meta.typ === 'url' ? 'url' : 'text'}
          value={draft}
          readOnly={meta.readonly}
          onChange={(e) => setDraft(e.target.value)}
          step={meta.typ === 'number' ? 'any' : undefined}
          className={`flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none transition-colors ${
            meta.readonly
              ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed'
              : dirty
              ? 'border-info-400 focus:ring-2 focus:ring-info-500'
              : 'border-gray-200 focus:ring-2 focus:ring-info-500'
          }`}
        />
        {!meta.readonly && (
          <>
            <Button
              variant={success ? 'success' : 'primary'}
              size="sm"
              onClick={handleSave}
              loading={saving}
              disabled={!dirty || saving || uploading}
            >
              {success ? '✓' : 'Speichern'}
            </Button>
            {isLogoFeld && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  loading={uploading}
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? 'Lädt…' : 'Datei hochladen'}
                </Button>
              </>
            )}
          </>
        )}
      </div>
      {uploadErr && <p className="text-xs text-red-500">{uploadErr}</p>}
    </div>
  );
}

// ─── Ganzjahres-Bedingung ─────────────────────────────────────────────────────

function GanzjahresBedingung({
  werte,
  onSave,
}: {
  werte:  KonfigWerte;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const initAktiv = String(werte.ganzjahres_bedingung_aktiv ?? 'true') !== 'false';
  const initMonate = Number(werte.ganzjahres_bedingung_mindest_monate_im_jahr ?? 0);

  const [aktiv,  setAktiv]  = useState(initAktiv);
  const [monate, setMonate] = useState(String(initMonate));
  const [saving, setSaving] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const toggleAktiv = async (v: boolean) => {
    setAktiv(v);
    setSaving('aktiv');
    try {
      await onSave('ganzjahres_bedingung_aktiv', v ? 'true' : 'false');
      setSuccess('aktiv');
      setTimeout(() => setSuccess(null), 2000);
    } finally {
      setSaving(null);
    }
  };

  const saveMonate = async () => {
    const num = Number(monate);
    if (isNaN(num) || num < 0 || num > 12) return;
    setSaving('monate');
    try {
      await onSave('ganzjahres_bedingung_mindest_monate_im_jahr', String(num));
      setSuccess('monate');
      setTimeout(() => setSuccess(null), 2000);
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ganzjahres-Bedingung</CardTitle>
      </CardHeader>

      <div className="space-y-5">
        <div className="rounded-xl border border-grenz-200 bg-grenz-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-4">
              <p className="text-sm font-semibold text-grenz-800">Strenge Ganzjahres-Bedingung aktiv</p>
              <p className="text-xs text-grenz-700 mt-1">
                Wenn aktiv: Mitarbeiter müssen <strong>vor dem 01.01.</strong> des Bonusjahres eingetreten
                sein, sonst keine Auszahlung. Überschreibt die Mindest-Betriebszugehörigkeit für
                Neueintritte im laufenden Bonusjahr.
              </p>
              <p className="text-xs text-grenz-700 mt-1">
                Wenn aus: Nur die <strong>Mindest-Betriebszugehörigkeit (Monate)</strong> oben zählt.
              </p>
            </div>
            <button
              onClick={() => !saving && toggleAktiv(!aktiv)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                aktiv ? 'bg-grenz-600' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${aktiv ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {success === 'aktiv' && (
            <p className="text-xs text-bonus-700 mt-2">✓ gespeichert</p>
          )}
        </div>

        {aktiv && (
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Anteilige Qualifikation bei Austritt (Mindest-Monate im Bonusjahr)
            </label>
            <p className="text-xs text-gray-400 mb-1.5">
              Mitarbeiter, die im Bonusjahr austreten, bleiben qualifiziert wenn sie mindestens diese
              Anzahl Monate im Jahr gearbeitet haben. Beispiel: <code>6</code> → Franz mit Austritt
              18.07. (7 Monate dabei) wird qualifiziert. <code>0</code> = Toleranz deaktiviert.
            </p>
            <div className="flex gap-2">
              <input
                type="number" min={0} max={12} value={monate}
                onChange={(e) => setMonate(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500 bg-white dark:bg-gray-800"
              />
              <span className="px-2 py-2 text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg">Monate</span>
              <Button size="sm"
                variant={success === 'monate' ? 'success' : 'primary'}
                loading={saving === 'monate'}
                onClick={saveMonate}
              >
                {success === 'monate' ? '✓' : 'Speichern'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Krankheits-Staffel ───────────────────────────────────────────────────────

function KrankheitsStaffel({
  werte,
  onSave,
}: {
  werte:  KonfigWerte;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const initKarenz   = Number(werte.kranktage_karenz ?? 15);
  const initAbzug    = Number(werte.kranktage_abzug_pro_tag_prozent ?? 4);
  const initMax      = Number(werte.kranktage_max_grenze ?? 40);
  const initEfzg     = String(werte.kranktage_efzg_schutz_aktiv ?? 'true') !== 'false';
  const initFaktor   = Number(werte.kranktage_efzg_tagesfaktor ?? 0.25);

  const [karenz, setKarenz]   = useState(String(initKarenz));
  const [abzug,  setAbzug]    = useState(String(initAbzug));
  const [max,    setMax]      = useState(String(initMax));
  const [efzg,   setEfzg]     = useState(initEfzg);
  const [faktor, setFaktor]   = useState(String(initFaktor));

  const [saving,  setSaving]  = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const speichern = async (key: string, value: string) => {
    setSaving(key);
    try {
      await onSave(key, value);
      setSuccess(key);
      setTimeout(() => setSuccess(null), 2000);
    } finally {
      setSaving(null);
    }
  };

  const toggleEfzg = async (v: boolean) => {
    setEfzg(v);
    await speichern('kranktage_efzg_schutz_aktiv', v ? 'true' : 'false');
  };

  // ── Vorschau ────────────────────────────────────────────────────────────────
  const [vorschauBonus,    setVorschauBonus]    = useState('3000');
  const [vorschauTage,     setVorschauTage]     = useState('20');
  const [vorschauStdLohn,  setVorschauStdLohn]  = useState('25');
  const [vorschauTagesStd, setVorschauTagesStd] = useState('8');

  const k        = Number(karenz)   || 0;
  const a        = Number(abzug)    || 0;
  const m        = Number(max)      || 0;
  const f        = Number(faktor)   || 0.25;
  const vBonus   = Number(vorschauBonus)    || 0;
  const vTage    = Number(vorschauTage)     || 0;
  const vStdLohn = Number(vorschauStdLohn)  || 0;
  const vStd     = Number(vorschauTagesStd) || 0;

  const krankenFaktor = (() => {
    if (vTage <= k) return 1;
    if (vTage >= m) return 0;
    return Math.max(0, 1 - ((vTage - k) * a) / 100);
  })();

  const nachProzent = vBonus * krankenFaktor;
  const tageslohn   = vStdLohn * vStd;
  const maxKuerzung = efzg && tageslohn > 0 ? vTage * tageslohn * f : null;
  const minBonus    = maxKuerzung !== null ? Math.max(0, vBonus - maxKuerzung) : null;
  const ergebnis    = minBonus !== null ? Math.max(nachProzent, minBonus) : nachProzent;
  const kuerzung    = vBonus - ergebnis;
  const efzgGreift  = minBonus !== null && minBonus > nachProzent;

  const fmtEur = (v: number) => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Krankheits-Staffel</CardTitle>
      </CardHeader>
      <p className="text-xs text-gray-400 mb-5">
        Bis zur Karenzgrenze wird 100 % des Bonus ausgezahlt. Darüber kürzt jede Krankheitstag den
        Bonus prozentual; § 4a EFZG begrenzt die maximale Kürzung pro Tag auf einen Anteil des Tageslohns.
      </p>

      <div className="space-y-5">
        {/* Karenz */}
        <div>
          <label className="text-sm font-medium text-gray-700">Karenzgrenze</label>
          <p className="text-xs text-gray-400 mb-1.5">Bis einschließlich dieser Tagesanzahl wird 100 % ausgezahlt.</p>
          <div className="flex gap-2">
            <input
              type="number" min={0} value={karenz}
              onChange={(e) => setKarenz(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500"
            />
            <Button size="sm"
              variant={success === 'kranktage_karenz' ? 'success' : 'primary'}
              loading={saving === 'kranktage_karenz'}
              onClick={() => speichern('kranktage_karenz', karenz)}
            >
              {success === 'kranktage_karenz' ? '✓' : 'Speichern'}
            </Button>
          </div>
        </div>

        {/* Abzug pro Tag */}
        <div>
          <label className="text-sm font-medium text-gray-700">Abzug pro Krankheitstag</label>
          <p className="text-xs text-gray-400 mb-1.5">Prozentuale Kürzung des Bonus je Tag oberhalb der Karenzgrenze.</p>
          <div className="flex gap-2">
            <input
              type="number" min={0} step={0.5} value={abzug}
              onChange={(e) => setAbzug(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500"
            />
            <span className="px-2 py-2 text-xs text-gray-400 bg-gray-50 rounded-lg">%</span>
            <Button size="sm"
              variant={success === 'kranktage_abzug_pro_tag_prozent' ? 'success' : 'primary'}
              loading={saving === 'kranktage_abzug_pro_tag_prozent'}
              onClick={() => speichern('kranktage_abzug_pro_tag_prozent', abzug)}
            >
              {success === 'kranktage_abzug_pro_tag_prozent' ? '✓' : 'Speichern'}
            </Button>
          </div>
        </div>

        {/* Maxgrenze */}
        <div>
          <label className="text-sm font-medium text-gray-700">Maxgrenze (Disqualifikation)</label>
          <p className="text-xs text-gray-400 mb-1.5">Ab dieser Tagesanzahl wird kein Bonus mehr gezahlt.</p>
          <div className="flex gap-2">
            <input
              type="number" min={0} value={max}
              onChange={(e) => setMax(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500"
            />
            <Button size="sm"
              variant={success === 'kranktage_max_grenze' ? 'success' : 'primary'}
              loading={saving === 'kranktage_max_grenze'}
              onClick={() => speichern('kranktage_max_grenze', max)}
            >
              {success === 'kranktage_max_grenze' ? '✓' : 'Speichern'}
            </Button>
          </div>
        </div>

        {/* EFZG-Schutz */}
        <div className="rounded-xl border border-info-200 bg-info-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold text-info-800">§ 4a EFZG-Schutz</p>
              <p className="text-xs text-info-700 mt-0.5">
                Pro Krankheitstag max. {Math.round(f * 100)} % eines Tageslohns Kürzung.
                MA bekommt den günstigeren Wert.
              </p>
            </div>
            <button
              onClick={() => toggleEfzg(!efzg)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                efzg ? 'bg-info-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  efzg ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {efzg && (
            <div className="flex gap-2 mt-3">
              <div className="flex-1">
                <label className="text-xs text-info-700 mb-1 block">Tagesfaktor (Anteil eines Tageslohns)</label>
                <input
                  type="number" min={0} max={1} step={0.05} value={faktor}
                  onChange={(e) => setFaktor(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-info-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500"
                />
              </div>
              <Button size="sm" className="self-end"
                variant={success === 'kranktage_efzg_tagesfaktor' ? 'success' : 'primary'}
                loading={saving === 'kranktage_efzg_tagesfaktor'}
                onClick={() => speichern('kranktage_efzg_tagesfaktor', faktor)}
              >
                {success === 'kranktage_efzg_tagesfaktor' ? '✓' : 'Speichern'}
              </Button>
            </div>
          )}
        </div>

        {/* Vorschau */}
        <div className="rounded-xl border border-bonus-200 bg-bonus-50 p-4">
          <p className="text-xs font-semibold text-bonus-800 mb-3">Vorschau — aktueller Konfigurations-Stand</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Bonus (€)</label>
              <input type="number" min={0} value={vorschauBonus}
                onChange={(e) => setVorschauBonus(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-bonus-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Kranktage</label>
              <input type="number" min={0} value={vorschauTage}
                onChange={(e) => setVorschauTage(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-bonus-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Stundenlohn (€)</label>
              <input type="number" min={0} value={vorschauStdLohn}
                onChange={(e) => setVorschauStdLohn(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-bonus-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tagesstunden</label>
              <input type="number" min={0} value={vorschauTagesStd}
                onChange={(e) => setVorschauTagesStd(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-bonus-400"
              />
            </div>
          </div>

          <div className="space-y-1.5 text-xs text-bonus-900">
            <div className="flex justify-between"><span>Krankheits-Faktor</span>
              <span className="font-semibold">{(krankenFaktor * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %</span>
            </div>
            <div className="flex justify-between"><span>Bonus prozentual gekürzt</span>
              <span className="tabular-nums">{fmtEur(nachProzent)}</span>
            </div>
            {minBonus !== null && (
              <div className="flex justify-between"><span>EFZG-Mindestbonus</span>
                <span className="tabular-nums">{fmtEur(minBonus)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-bonus-300 pt-1.5 font-semibold">
              <span>Ergebnis (MA bekommt)</span>
              <span className="tabular-nums">{fmtEur(ergebnis)}</span>
            </div>
            <div className="flex justify-between text-malus-700">
              <span>Kürzung</span>
              <span className="tabular-nums">−{fmtEur(kuerzung)}</span>
            </div>
            {efzgGreift && (
              <p className="text-xs text-info-700 mt-1.5 italic">§ 4a EFZG-Schutz greift — schützt vor zu hoher prozentualer Kürzung.</p>
            )}
            {vTage >= m && (
              <p className="text-xs text-malus-700 mt-1.5 italic">Krankheitstage erreichen die Maxgrenze → Disqualifikation (Gesamt 0 €).</p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Bonus-Berechnungsoptionen ────────────────────────────────────────────────

function BonusOptionen({
  werte,
  onSave,
}: {
  werte:   KonfigWerte;
  onSave:  (key: string, value: string) => Promise<void>;
}) {
  const initSchwelle = Number(werte.mindest_auslastung_bonusrelevant ?? 80);
  const [schwelle,  setSchwelle]  = useState(String(initSchwelle));
  const [h1Aktiv,   setH1Aktiv]   = useState(werte.halbjahresauszahlung_aktiv === 'true');
  const [savingS,   setSavingS]   = useState(false);
  const [savingH,   setSavingH]   = useState(false);
  const [successS,  setSuccessS]  = useState(false);
  const [successH,  setSuccessH]  = useState(false);

  const dirtyS = schwelle !== String(initSchwelle);

  const saveSchwelle = async () => {
    const val = Number(schwelle);
    if (isNaN(val) || val < 0 || val > 100) return;
    setSavingS(true);
    try {
      await onSave('mindest_auslastung_bonusrelevant', String(val));
      setSuccessS(true);
      setTimeout(() => setSuccessS(false), 2000);
    } finally {
      setSavingS(false);
    }
  };

  const saveH1 = async (aktiv: boolean) => {
    setSavingH(true);
    setH1Aktiv(aktiv);
    try {
      await onSave('halbjahresauszahlung_aktiv', aktiv ? 'true' : 'false');
      setSuccessH(true);
      setTimeout(() => setSuccessH(false), 2000);
    } finally {
      setSavingH(false);
    }
  };

  const schwelleNum = Number(schwelle);
  const schwelleGueltig = !isNaN(schwelleNum) && schwelleNum >= 0 && schwelleNum <= 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bonus-Berechnungsoptionen</CardTitle>
      </CardHeader>
      <div className="space-y-6">

        {/* Auslastungs-Schwellenwert */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <label className="text-sm font-medium text-gray-700">Option B — Mindest-Auslastung für Bonusrelevanz</label>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">%</span>
          </div>
          <p className="text-xs text-gray-400">
            Nur Projekte, deren Ist-Stunden mindestens diesen Anteil der Soll-Stunden erreichen,
            fließen in den Option-B-Saldo ein. Abgeschlossene Projekte zählen immer — unabhängig
            von dieser Schwelle.
          </p>
          <div className="flex gap-2 items-start">
            <div className="flex-1 space-y-1">
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={schwelle}
                onChange={(e) => setSchwelle(e.target.value)}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none transition-colors ${
                  dirtyS
                    ? 'border-info-400 focus:ring-2 focus:ring-info-500'
                    : 'border-gray-200 focus:ring-2 focus:ring-info-500'
                }`}
              />
              {schwelleGueltig && (
                <p className="text-xs text-info-700 bg-info-50 rounded-lg px-3 py-2">
                  {schwelleNum === 0
                    ? 'Alle Projekte zählen (kein Filter)'
                    : schwelleNum === 100
                    ? 'Nur vollständig abgearbeitete oder abgeschlossene Projekte'
                    : `Projekte ab ${schwelleNum}% Auslastung oder mit Status „Abgeschlossen"`}
                </p>
              )}
            </div>
            <Button
              variant={successS ? 'success' : 'primary'}
              size="sm"
              onClick={saveSchwelle}
              loading={savingS}
              disabled={!dirtyS || !schwelleGueltig || savingS}
            >
              {successS ? '✓' : 'Speichern'}
            </Button>
          </div>
        </div>

        {/* Halbjahresauszahlung */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Halbjahres-Auszahlung (Option A)</label>
          <p className="text-xs text-gray-400">
            Ermöglicht eine optionale H1-Vorauszahlung der Option-A-Beträge. Der ausgezahlte Betrag
            wird beim Jahresabschluss automatisch abgezogen.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => !savingH && saveH1(!h1Aktiv)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                h1Aktiv ? 'bg-info-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  h1Aktiv ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${h1Aktiv ? 'text-info-700' : 'text-gray-500'}`}>
              {savingH ? 'Speichere…' : h1Aktiv ? 'Aktiviert' : 'Deaktiviert'}
              {successH && ' ✓'}
            </span>
          </div>
          {h1Aktiv && (
            <p className="text-xs text-info-700 bg-info-50 rounded-lg px-3 py-2">
              Im Jahresabschluss erscheint ein Abschnitt für die Halbjahres-Auszahlung.
            </p>
          )}
        </div>

      </div>
    </Card>
  );
}

// ─── Stufensatz Option B ─────────────────────────────────────────────────────

function StufenSatzKonfigurator({
  werte,
  onSave,
}: {
  werte:   KonfigWerte;
  onSave:  (key: string, value: string) => Promise<void>;
}) {
  const [s1bis,  setS1bis]  = useState(String(Number(werte.stundensatzb_stufe1_bis)  || 20));
  const [s1satz, setS1satz] = useState(String(Number(werte.stundensatzb_stufe1_satz) || 30));
  const [s2bis,  setS2bis]  = useState(String(Number(werte.stundensatzb_stufe2_bis)  || 40));
  const [s2satz, setS2satz] = useState(String(Number(werte.stundensatzb_stufe2_satz) || 20));
  const [s3satz, setS3satz] = useState(String(Number(werte.stundensatzb_stufe3_satz) || 15));

  const [saving, setSaving]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const speichern = async (key: string, value: string) => {
    const num = Number(value);
    if (isNaN(num) || num < 0) return;
    setSaving(key);
    try {
      await onSave(key, String(num));
      setSuccess(key);
      setTimeout(() => setSuccess(null), 2000);
    } finally {
      setSaving(null);
    }
  };

  const beispiel = (stunden: number) => {
    const s1b = Number(s1bis) || 20;
    const s1s = Number(s1satz) || 30;
    const s2b = Number(s2bis) || 40;
    const s2s = Number(s2satz) || 20;
    const s3s = Number(s3satz) || 15;
    let betrag = 0;
    betrag += Math.min(stunden, s1b) * s1s;
    if (stunden > s1b) betrag += Math.min(stunden - s1b, s2b - s1b) * s2s;
    if (stunden > s2b) betrag += (stunden - s2b) * s3s;
    return betrag;
  };

  const fmtEur = (v: number) => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

  const s1b = Number(s1bis) || 20;
  const s2b = Number(s2bis) || 40;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stundensatz Option B — Stufenmodell</CardTitle>
      </CardHeader>
      <p className="text-xs text-gray-400 mb-5">
        Der Jahres-Überschuss eines Mitarbeiters wird gestaffelt vergütet. Jede Stufe gilt
        für den jeweiligen Stundenbereich des Gesamtsaldos.
      </p>

      <div className="space-y-5">

        {/* Stufe 1 */}
        <div className="rounded-xl border border-bonus-200 bg-bonus-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-bonus-600 text-white text-xs font-bold">1</span>
            <span className="text-sm font-semibold text-bonus-800">Stufe 1 — die ersten Stunden</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Gilt bis zu (Stunden)</label>
              <div className="flex gap-2">
                <input
                  type="number" min={1} value={s1bis}
                  onChange={(e) => setS1bis(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-bonus-400"
                />
                <Button size="sm"
                  variant={success === 'stundensatzb_stufe1_bis' ? 'success' : 'primary'}
                  loading={saving === 'stundensatzb_stufe1_bis'}
                  onClick={() => speichern('stundensatzb_stufe1_bis', s1bis)}
                >
                  {success === 'stundensatzb_stufe1_bis' ? '✓' : 'Speichern'}
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Satz (€/h)</label>
              <div className="flex gap-2">
                <input
                  type="number" min={0} step={0.5} value={s1satz}
                  onChange={(e) => setS1satz(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-bonus-400"
                />
                <Button size="sm"
                  variant={success === 'stundensatzb_stufe1_satz' ? 'success' : 'primary'}
                  loading={saving === 'stundensatzb_stufe1_satz'}
                  onClick={() => speichern('stundensatzb_stufe1_satz', s1satz)}
                >
                  {success === 'stundensatzb_stufe1_satz' ? '✓' : 'Speichern'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Stufe 2 */}
        <div className="rounded-xl border border-grenz-200 bg-grenz-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-grenz-500 text-white text-xs font-bold">2</span>
            <span className="text-sm font-semibold text-grenz-800">Stufe 2 — mittlerer Bereich (Std. {s1b + 1}–{s2b})</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Gilt bis zu (Stunden)</label>
              <div className="flex gap-2">
                <input
                  type="number" min={Number(s1bis) + 1} value={s2bis}
                  onChange={(e) => setS2bis(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-grenz-400"
                />
                <Button size="sm"
                  variant={success === 'stundensatzb_stufe2_bis' ? 'success' : 'primary'}
                  loading={saving === 'stundensatzb_stufe2_bis'}
                  onClick={() => speichern('stundensatzb_stufe2_bis', s2bis)}
                >
                  {success === 'stundensatzb_stufe2_bis' ? '✓' : 'Speichern'}
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Satz (€/h)</label>
              <div className="flex gap-2">
                <input
                  type="number" min={0} step={0.5} value={s2satz}
                  onChange={(e) => setS2satz(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-grenz-400"
                />
                <Button size="sm"
                  variant={success === 'stundensatzb_stufe2_satz' ? 'success' : 'primary'}
                  loading={saving === 'stundensatzb_stufe2_satz'}
                  onClick={() => speichern('stundensatzb_stufe2_satz', s2satz)}
                >
                  {success === 'stundensatzb_stufe2_satz' ? '✓' : 'Speichern'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Stufe 3 */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-500 text-white text-xs font-bold">3</span>
            <span className="text-sm font-semibold text-gray-700">Stufe 3 — alles ab Std. {s2b + 1}</span>
          </div>
          <div className="max-w-xs">
            <label className="text-xs text-gray-500 mb-1 block">Satz (€/h)</label>
            <div className="flex gap-2">
              <input
                type="number" min={0} step={0.5} value={s3satz}
                onChange={(e) => setS3satz(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500"
              />
              <Button size="sm"
                variant={success === 'stundensatzb_stufe3_satz' ? 'success' : 'primary'}
                loading={saving === 'stundensatzb_stufe3_satz'}
                onClick={() => speichern('stundensatzb_stufe3_satz', s3satz)}
              >
                {success === 'stundensatzb_stufe3_satz' ? '✓' : 'Speichern'}
              </Button>
            </div>
          </div>
        </div>

        {/* Beispielrechnung */}
        <div className="rounded-xl border border-info-200 bg-info-50 p-4">
          <p className="text-xs font-semibold text-info-700 mb-3">Beispielrechnung</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[20, 40, 60].map((h) => (
              <div key={h} className="bg-white rounded-lg p-2 text-center">
                <p className="text-gray-400">{h} h Saldo</p>
                <p className="font-bold text-info-700 text-sm mt-0.5">{fmtEur(beispiel(h))}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </Card>
  );
}

// ─── Live-Prognose-Vorschau ───────────────────────────────────────────────────

interface LiveVorschauProps {
  werte: KonfigWerte;
  stundensatzA: number;
}

function LiveVorschau({ werte, stundensatzA }: LiveVorschauProps) {
  const beispielStunden = 120;
  const beispielSaldoB  = 80;

  const s1bis  = Number(werte.stundensatzb_stufe1_bis)  || 20;
  const s1satz = Number(werte.stundensatzb_stufe1_satz) || 30;
  const s2bis  = Number(werte.stundensatzb_stufe2_bis)  || 40;
  const s2satz = Number(werte.stundensatzb_stufe2_satz) || 20;
  const s3satz = Number(werte.stundensatzb_stufe3_satz) || 15;

  const optionBBetrag = (() => {
    let b = 0;
    b += Math.min(beispielSaldoB, s1bis) * s1satz;
    if (beispielSaldoB > s1bis) b += Math.min(beispielSaldoB - s1bis, s2bis - s1bis) * s2satz;
    if (beispielSaldoB > s2bis) b += (beispielSaldoB - s2bis) * s3satz;
    return b;
  })();

  const stufenFormel = (() => {
    const teile: string[] = [];
    const s1 = Math.min(beispielSaldoB, s1bis);
    teile.push(`${s1} h × ${s1satz} €`);
    if (beispielSaldoB > s1bis) {
      const s2 = Math.min(beispielSaldoB - s1bis, s2bis - s1bis);
      teile.push(`${s2} h × ${s2satz} €`);
    }
    if (beispielSaldoB > s2bis) {
      teile.push(`${beispielSaldoB - s2bis} h × ${s3satz} €`);
    }
    return teile.join(' + ');
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live-Vorschau</CardTitle>
      </CardHeader>
      <p className="text-xs text-gray-400 mb-4">
        Beispielrechnung mit {beispielStunden} Option-A-Stunden und {beispielSaldoB} h Projektsaldo
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-bonus-50 rounded-xl p-3">
          <p className="text-xs text-gray-500">Option A (Zusatzstunden)</p>
          <p className="text-lg font-bold text-bonus-700">
            {(beispielStunden * stundensatzA).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{beispielStunden} h × {stundensatzA} €/h</p>
        </div>
        <div className="bg-bonus-50 rounded-xl p-3">
          <p className="text-xs text-gray-500">Option B (Projektsaldo)</p>
          <p className="text-lg font-bold text-bonus-700">
            {optionBBetrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{stufenFormel}</p>
        </div>
      </div>
    </Card>
  );
}

// ─── API-Key-Bereich ──────────────────────────────────────────────────────────

function ApiKeyBereich() {
  const [key,    setKey]    = useState('');
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const handleSave = async () => {
    if (!key.trim()) return;
    setSaving(true);
    setFehler(null);
    try {
      await putApiKey(key.trim());
      setKey('');
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch {
      setFehler('API-Key konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>API-Key setzen</CardTitle>
      </CardHeader>
      <p className="text-xs text-gray-400 mb-4">
        Der API-Key wird verschlüsselt gespeichert und nie im Klartext zurückgegeben.
        Nur Superadmins können diesen Wert ändern.
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          placeholder="Neuer API-Key…"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500"
        />
        <Button
          variant={done ? 'success' : 'primary'}
          size="sm"
          onClick={handleSave}
          loading={saving}
          disabled={!key.trim() || saving}
        >
          {done ? 'Gespeichert ✓' : 'Speichern'}
        </Button>
      </div>
      {fehler && <p className="text-xs text-malus-600 mt-2">{fehler}</p>}
    </Card>
  );
}

// ─── Rollen-Verwaltung ────────────────────────────────────────────────────────

function RollenVerwaltung({ isSuperadmin }: { isSuperadmin: boolean }) {
  const [rollen,    setRollen]    = useState<Rolle[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [editId,    setEditId]    = useState<number | null>(null);
  const [editBez,   setEditBez]   = useState('');
  const [editFakt,  setEditFakt]  = useState('');
  const [saving,    setSaving]    = useState(false);
  const [fehler,    setFehler]    = useState<string | null>(null);
  const [neuBez,    setNeuBez]    = useState('');
  const [neuFakt,   setNeuFakt]   = useState('1.0');
  const [adding,    setAdding]    = useState(false);
  const [showAdd,   setShowAdd]   = useState(false);

  const laden = useCallback(async () => {
    setLoading(true);
    try {
      setRollen(await getRollen());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const startEdit = (r: Rolle) => {
    setEditId(r.id);
    setEditBez(r.bezeichnung);
    setEditFakt(String(Number(r.faktor)));
    setFehler(null);
  };

  const saveEdit = async () => {
    if (!editId) return;
    setSaving(true);
    setFehler(null);
    try {
      await updateRolle(editId, {
        bezeichnung: editBez.trim(),
        faktor:      Number(editFakt),
      });
      setEditId(null);
      await laden();
    } catch (e: unknown) {
      setFehler((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: Rolle) => {
    if (!confirm(`Rolle "${r.bezeichnung}" wirklich löschen?`)) return;
    setFehler(null);
    try {
      await deleteRolle(r.id);
      await laden();
    } catch (e: unknown) {
      setFehler((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Fehler beim Löschen');
    }
  };

  const handleAdd = async () => {
    if (!neuBez.trim() || isNaN(Number(neuFakt))) return;
    setAdding(true);
    setFehler(null);
    try {
      await createRolle(neuBez.trim(), Number(neuFakt));
      setNeuBez('');
      setNeuFakt('1.0');
      setShowAdd(false);
      await laden();
    } catch (e: unknown) {
      setFehler((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Fehler beim Anlegen');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rollen</CardTitle>
        {isSuperadmin && (
          <Button variant="secondary" size="xs" onClick={() => { setShowAdd(!showAdd); setFehler(null); }}>
            {showAdd ? 'Abbrechen' : '+ Neue Rolle'}
          </Button>
        )}
      </CardHeader>

      {fehler && (
        <div className="mb-3 text-xs text-malus-700 bg-malus-50 border border-malus-200 rounded-lg px-3 py-2">
          {fehler}
        </div>
      )}

      {/* Neue Rolle hinzufügen */}
      {showAdd && isSuperadmin && (
        <div className="mb-4 flex gap-2 items-end flex-wrap border border-dashed border-info-300 rounded-xl p-3 bg-info-50">
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-gray-500 mb-1 block">Bezeichnung</label>
            <input
              type="text"
              placeholder="z.B. Meister"
              value={neuBez}
              onChange={(e) => setNeuBez(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500"
            />
          </div>
          <div className="w-24">
            <label className="text-xs text-gray-500 mb-1 block">Faktor</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={neuFakt}
              onChange={(e) => setNeuFakt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500"
            />
          </div>
          <Button variant="primary" size="xs" onClick={handleAdd} loading={adding} disabled={!neuBez.trim()}>
            Anlegen
          </Button>
        </div>
      )}

      {/* Rollen-Liste */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-4">Lädt…</p>
      ) : (
        <div className="space-y-1">
          {rollen.map((r) => (
            <div key={r.id}>
              {editId === r.id && isSuperadmin ? (
                /* Inline-Bearbeitung */
                <div className="flex gap-2 items-center flex-wrap py-2 px-2 bg-info-50 rounded-xl border border-info-200">
                  <input
                    type="text"
                    value={editBez}
                    onChange={(e) => setEditBez(e.target.value)}
                    className="flex-1 min-w-[100px] px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500"
                    autoFocus
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400">×</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={editFakt}
                      onChange={(e) => setEditFakt(e.target.value)}
                      className="w-20 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500"
                    />
                  </div>
                  <div className="flex gap-1">
                    <Button variant="primary" size="xs" onClick={saveEdit} loading={saving}>Speichern</Button>
                    <Button variant="secondary" size="xs" onClick={() => setEditId(null)}>Abbruch</Button>
                  </div>
                </div>
              ) : (
                /* Normale Zeile */
                <div className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-gray-50">
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">{r.bezeichnung}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-info-50 text-info-700 font-medium">
                      ×{Number(r.faktor).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {r._count?.mitarbeiter ?? 0} MA
                  </span>
                  {isSuperadmin && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(r)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-info-600 hover:bg-info-50 active:bg-info-100 transition-colors"
                        title="Bearbeiten"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(r)}
                        disabled={(r._count?.mitarbeiter ?? 0) > 0}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-malus-600 hover:bg-malus-50 active:bg-malus-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title={(r._count?.mitarbeiter ?? 0) > 0 ? 'Nicht löschbar: Mitarbeiter zugewiesen' : 'Löschen'}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!isSuperadmin && (
        <p className="mt-2 text-xs text-gray-400">Nur Superadmins können Rollen anlegen oder bearbeiten.</p>
      )}
    </Card>
  );
}

// ─── Projektfilter-Verwaltung ─────────────────────────────────────────────────

function ProjektFilterVerwaltung() {
  const [projekte, setProjekte] = useState<ProjektMitStunden[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);
  const [suche,    setSuche]    = useState('');

  const laden = useCallback(async () => {
    setLoading(true);
    try {
      setProjekte(await getProjekteListe());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const handleToggle = async (id: number) => {
    setToggling(id);
    try {
      const res = await toggleBonusAusschluss(id);
      setProjekte((prev) =>
        prev.map((p) => p.id === id ? { ...p, bonusAusgeschlossen: res.bonusAusgeschlossen } : p),
      );
    } finally {
      setToggling(null);
    }
  };

  const sichtbar = projekte.filter((p) =>
    !suche ||
    p.projektname.toLowerCase().includes(suche.toLowerCase()) ||
    p.projektnummer.toLowerCase().includes(suche.toLowerCase()),
  );

  const ausgeschlossenAnzahl = projekte.filter((p) => p.bonusAusgeschlossen).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projektfilter</CardTitle>
        {ausgeschlossenAnzahl > 0 && (
          <span className="text-xs text-grenz-600 bg-grenz-50 border border-grenz-200 px-2 py-0.5 rounded-full font-medium">
            {ausgeschlossenAnzahl} ausgeschlossen
          </span>
        )}
      </CardHeader>
      <p className="text-xs text-gray-400 mb-4">
        Ausgecheckte Projekte werden weder in der Projektübersicht angezeigt noch in die
        Bonus-Berechnung einbezogen.
      </p>

      <input
        type="text"
        placeholder="Projekt suchen…"
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
        className="w-full mb-3 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500"
      />

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-4">Lädt…</p>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
          {sichtbar.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Keine Projekte gefunden</p>
          )}
          {sichtbar.map((p) => (
            <label
              key={p.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                p.bonusAusgeschlossen
                  ? 'bg-grenz-50 border border-grenz-100'
                  : 'hover:bg-gray-50'
              } ${toggling === p.id ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <input
                type="checkbox"
                checked={p.bonusAusgeschlossen}
                onChange={() => handleToggle(p.id)}
                className="h-4 w-4 rounded border-gray-300 text-grenz-600 focus:ring-grenz-500 cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${p.bonusAusgeschlossen ? 'text-grenz-700' : 'text-gray-800'}`}>
                  {p.projektname}
                </p>
                <p className="text-xs text-gray-400">{p.projektnummer} · {p.status}</p>
              </div>
              {p.bonusAusgeschlossen && (
                <span className="flex-shrink-0 text-xs text-grenz-600 font-medium">ausgeschlossen</span>
              )}
            </label>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Änderungsprotokoll ───────────────────────────────────────────────────────

function Aenderungslog({ logs }: { logs: KonfigLogEintrag[] }) {
  function formatDatum(iso: string) {
    return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Änderungsprotokoll</CardTitle>
      </CardHeader>
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {logs.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Noch keine Änderungen</p>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 text-xs border-b border-gray-50 pb-2">
            <div className="w-32 flex-shrink-0 text-gray-400">{formatDatum(log.geaendertAm)}</div>
            <div className="flex-1">
              <span className="font-medium text-gray-700">{log.key}</span>
              <span className="text-gray-400 mx-1">:</span>
              <span className="text-malus-600 line-through">{log.alterWert ?? '(leer)'}</span>
              <span className="text-gray-400 mx-1">→</span>
              <span className="text-bonus-600">{log.neuerWert}</span>
            </div>
            <div className="flex-shrink-0 text-gray-400">{log.geaendertVon}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function AdminKonfiguration() {
  const { state }      = useAuth();
  const isSuperadmin   = state.status === 'admin' && state.user.rolle === 'superadmin';

  const [werte,   setWerte]   = useState<KonfigWerte | null>(null);
  const [logs,    setLogs]    = useState<KonfigLogEintrag[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler,  setFehler]  = useState<string | null>(null);

  const laden = useCallback(async () => {
    setLoading(true);
    setFehler(null);
    try {
      const [k, l] = await Promise.all([getKonfiguration(), getKonfigLog()]);
      setWerte(k);
      setLogs(l);
    } catch {
      setFehler('Konfiguration konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const handleSave = async (key: string, value: string) => {
    await putKonfiguration(key, value);
    const updated = await getKonfiguration();
    setWerte(updated);
    const newLogs = await getKonfigLog();
    setLogs(newLogs);
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-fadeIn">
        {[0,1,2].map((i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (fehler || !werte) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-malus-600 font-medium">{fehler}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={laden}>Erneut versuchen</Button>
        </div>
      </div>
    );
  }

  const stundensatzA = Number(werte.stundensatz_option_a) || 5;

  // Felder nach Gruppen aufteilen
  const gruppen: { titel: string; felder: KonfigMeta[] }[] = [
    {
      titel: 'Bonus-Berechnung',
      felder: FELDER.filter((f) =>
        ['stundensatz_option_a', 'rollenfaktor_min'].includes(f.key),
      ),
    },
    {
      titel: 'Qualifikations-Regeln',
      felder: FELDER.filter((f) =>
        ['mindest_betriebszugehoerigkeit_monate', 'auszahlungsstichtag'].includes(f.key),
      ),
    },
    {
      titel: 'Unternehmen',
      felder: FELDER.filter((f) =>
        ['unternehmensname', 'unternehmens_logo_url'].includes(f.key),
      ),
    },
    {
      titel: 'API & Sync',
      felder: FELDER.filter((f) =>
        ['api_endpoint_url', 'sync_cron_ausdruck', 'sync_cron_ausdruck_aktiv'].includes(f.key),
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Gruppen */}
      {gruppen.map((gruppe) => (
        <Card key={gruppe.titel}>
          <CardHeader>
            <CardTitle>{gruppe.titel}</CardTitle>
          </CardHeader>
          <div className="space-y-5">
            {gruppe.felder.map((meta) => (
              <KonfigFeld
                key={meta.key}
                meta={meta}
                wert={String(werte[meta.key] ?? '')}
                onSave={handleSave}
              />
            ))}
          </div>
        </Card>
      ))}

      {/* Stufenmodell Option B */}
      <StufenSatzKonfigurator werte={werte} onSave={handleSave} />

      {/* Ganzjahres-Bedingung (Eintritt vor 01.01.) */}
      <GanzjahresBedingung werte={werte} onSave={handleSave} />

      {/* Krankheits-Staffel + EFZG-Schutz */}
      <KrankheitsStaffel werte={werte} onSave={handleSave} />

      {/* Bonus-Berechnungsoptionen */}
      <BonusOptionen werte={werte} onSave={handleSave} />

      {/* Live-Vorschau */}
      <LiveVorschau werte={werte} stundensatzA={stundensatzA} />

      {/* Projektfilter */}
      <ProjektFilterVerwaltung />

      {/* Rollen-Verwaltung */}
      <RollenVerwaltung isSuperadmin={isSuperadmin} />

      {/* API-Key (nur Superadmin) */}
      {isSuperadmin && <ApiKeyBereich />}

      {/* Änderungsprotokoll */}
      <Aenderungslog logs={logs} />
    </div>
  );
}
