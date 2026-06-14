import { useState, useCallback, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { apiClient as api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';

// ─── Typen ───────────────────────────────────────────────────────────────────

interface AdminUser {
  id:           number;
  name:         string;
  email:        string;
  rolle:        'superadmin' | 'admin';
  aktiv:        boolean;
  letzterLogin: string | null;
  erstelltAm:  string;
}

interface Rolle {
  id:          number;
  bezeichnung: string;
  faktor:      number;
}

interface Mitarbeiter {
  id:                     number;
  externeId:              string | null;
  personalNummer:         string | null;
  email:                  string | null;
  vorname:                string;
  nachname:               string;
  rolle:                  Rolle;
  eintrittsdatum:         string | null;
  kranktageAktuellesJahr: number;
  auszahlungspraeferenz:  'geld' | 'freizeit';
  aktiv:                  boolean;
  zuletztSynchronisiert:  string;
}

// ─── API-Helfer ───────────────────────────────────────────────────────────────

const getAdminUsers     = async () => (await api.get('/admin/users')).data.data as AdminUser[];
const createAdminUser   = async (d: object)   => (await api.post('/admin/users', d)).data.data as AdminUser;
const editAdminUser     = async (id: number, d: object) => (await api.patch(`/admin/users/${id}`, d)).data.data as AdminUser;
const deleteAdminUser   = async (id: number)  => { await api.delete(`/admin/users/${id}`); };
const deactivateAdmin   = async (id: number)  => { await api.patch(`/admin/users/${id}/deaktivieren`); };
const reactivateAdmin   = async (id: number)  => { await api.patch(`/admin/users/${id}/reaktivieren`); };

const getMitarbeiter    = async () => (await api.get('/mitarbeiter')).data.data as Mitarbeiter[];
const createMitarbeiter = async (d: object)   => (await api.post('/mitarbeiter', d)).data.data as Mitarbeiter;
const editMitarbeiter   = async (id: number, d: object) => (await api.patch(`/mitarbeiter/${id}`, d)).data.data as Mitarbeiter;
const deleteMitarbeiter = async (id: number)  => { await api.delete(`/mitarbeiter/${id}`); };
const deactivateMA      = async (id: number)  => { await api.patch(`/mitarbeiter/${id}/deaktivieren`); };
const reactivateMA      = async (id: number)  => { await api.patch(`/mitarbeiter/${id}/reaktivieren`); };
const getRollen         = async () => (await api.get('/rollen')).data.data as Rolle[];
const syncMitarbeiter   = async () => (await api.post('/mitarbeiter/sync')).data.data;

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

const fmt  = (iso: string | null) => iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtD = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('de-DE') : '—';

const inputCls  = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500';
const selectCls = inputCls + ' bg-white';

function Avatar({ name, active }: { name: string; active: boolean }) {
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
      active ? 'bg-info-100 text-info-700' : 'bg-gray-100 text-gray-400'
    }`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Tab-Leiste ───────────────────────────────────────────────────────────────

function Tabs({ active, onChange, counts }: {
  active: 'admins' | 'mitarbeiter';
  onChange: (t: 'admins' | 'mitarbeiter') => void;
  counts: { admins: number; mitarbeiter: number };
}) {
  const tab = (key: 'admins' | 'mitarbeiter', label: string, count: number) => (
    <button
      onClick={() => onChange(key)}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active === key
          ? 'border-info-600 text-info-700'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {label}
      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
        active === key ? 'bg-info-100 text-info-700' : 'bg-gray-100 text-gray-500'
      }`}>
        {count}
      </span>
    </button>
  );

  return (
    <div className="flex border-b border-gray-100 mb-6">
      {tab('admins',      'Admin-Benutzer', counts.admins)}
      {tab('mitarbeiter', 'Mitarbeiter',    counts.mitarbeiter)}
    </div>
  );
}

// ─── Admin Edit Modal ─────────────────────────────────────────────────────────

function AdminEditModal({ user, onClose, onSaved }: {
  user: AdminUser; onClose: () => void; onSaved: () => void;
}) {
  const [name,     setName]     = useState(user.name);
  const [email,    setEmail]    = useState(user.email);
  const [rolle,    setRolle]    = useState(user.rolle);
  const [passwort, setPasswort] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [fehler,   setFehler]   = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setFehler(null);
    try {
      const p: Record<string, string> = {};
      if (name.trim()  !== user.name)  p.name  = name.trim();
      if (email.trim() !== user.email) p.email = email.trim();
      if (rolle        !== user.rolle) p.rolle = rolle;
      if (passwort.trim())             p.passwort = passwort.trim();
      await editAdminUser(user.id, p);
      onSaved(); onClose();
    } catch { setFehler('Speichern fehlgeschlagen. Bitte Eingaben prüfen.'); }
    finally   { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-base font-semibold">Admin bearbeiten</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div><label className="text-xs text-gray-500 mb-1 block">Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></div>
          <div><label className="text-xs text-gray-500 mb-1 block">E-Mail</label>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Rolle</label>
            <select value={rolle} onChange={(e) => setRolle(e.target.value as 'admin' | 'superadmin')} className={selectCls}>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Neues Passwort <span className="text-gray-300">(leer = unverändert, mind. 10 Z.)</span></label>
            <input type="password" minLength={10} value={passwort} onChange={(e) => setPasswort(e.target.value)} placeholder="••••••••••" className={inputCls} /></div>
          {fehler && <p className="text-xs text-red-600">{fehler}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Abbrechen</Button>
            <Button type="submit" variant="primary" size="sm" loading={saving} disabled={saving}>Speichern</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Mitarbeiter Edit Modal ───────────────────────────────────────────────────

function MAEditModal({ ma, rollen, onClose, onSaved }: {
  ma: Mitarbeiter; rollen: Rolle[]; onClose: () => void; onSaved: () => void;
}) {
  const [vorname,    setVorname]    = useState(ma.vorname);
  const [nachname,   setNachname]   = useState(ma.nachname);
  const [rolleId,    setRolleId]    = useState(ma.rolle.id);
  const [eintritt,   setEintritt]   = useState(ma.eintrittsdatum?.slice(0, 10) ?? '');
  const [kranktage,  setKranktage]  = useState(ma.kranktageAktuellesJahr);
  const [praeferenz, setPraeferenz] = useState(ma.auszahlungspraeferenz);
  const [saving,     setSaving]     = useState(false);
  const [fehler,     setFehler]     = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setFehler(null);
    try {
      await editMitarbeiter(ma.id, {
        vorname:                vorname.trim(),
        nachname:               nachname.trim(),
        rolleId,
        eintrittsdatum:         eintritt || null,
        kranktageAktuellesJahr: kranktage,
        auszahlungspraeferenz:  praeferenz,
      });
      onSaved(); onClose();
    } catch { setFehler('Speichern fehlgeschlagen.'); }
    finally   { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-base font-semibold">Mitarbeiter bearbeiten</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">Vorname</label>
              <input required value={vorname} onChange={(e) => setVorname(e.target.value)} className={inputCls} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Nachname</label>
              <input required value={nachname} onChange={(e) => setNachname(e.target.value)} className={inputCls} /></div>
          </div>
          <div><label className="text-xs text-gray-500 mb-1 block">Rolle</label>
            <select value={rolleId} onChange={(e) => setRolleId(Number(e.target.value))} className={selectCls}>
              {rollen.map((r) => <option key={r.id} value={r.id}>{r.bezeichnung} (×{Number(r.faktor).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })})</option>)}
            </select></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Eintrittsdatum <span className="text-gray-300">(optional)</span></label>
            <input type="date" value={eintritt} onChange={(e) => setEintritt(e.target.value)} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">Kranktage (akt. Jahr)</label>
              <input type="number" min={0} max={365} value={kranktage} onChange={(e) => setKranktage(Number(e.target.value))} className={inputCls} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Auszahlungspräferenz</label>
              <select value={praeferenz} onChange={(e) => setPraeferenz(e.target.value as 'geld' | 'freizeit')} className={selectCls}>
                <option value="geld">Geld</option>
                <option value="freizeit">Freizeit</option>
              </select></div>
          </div>
          {fehler && <p className="text-xs text-red-600">{fehler}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Abbrechen</Button>
            <Button type="submit" variant="primary" size="sm" loading={saving} disabled={saving}>Speichern</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Mitarbeiter Neu Modal ────────────────────────────────────────────────────

function MANeuModal({ rollen, onClose, onSaved }: {
  rollen: Rolle[]; onClose: () => void; onSaved: () => void;
}) {
  const [vorname,    setVorname]    = useState('');
  const [nachname,   setNachname]   = useState('');
  const [rolleId,    setRolleId]    = useState(rollen[0]?.id ?? 0);
  const [eintritt,   setEintritt]   = useState('');
  const [creating,   setCreating]   = useState(false);
  const [fehler,     setFehler]     = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true); setFehler(null);
    try {
      await createMitarbeiter({
        vorname:        vorname.trim(),
        nachname:       nachname.trim(),
        rolleId,
        eintrittsdatum: eintritt || undefined,
      });
      onSaved(); onClose();
    } catch { setFehler('Anlegen fehlgeschlagen. Bitte Eingaben prüfen.'); }
    finally   { setCreating(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-base font-semibold">Neuen Mitarbeiter anlegen</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">Vorname</label>
              <input required value={vorname} onChange={(e) => setVorname(e.target.value)} placeholder="Max" className={inputCls} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Nachname</label>
              <input required value={nachname} onChange={(e) => setNachname(e.target.value)} placeholder="Mustermann" className={inputCls} /></div>
          </div>
          <div><label className="text-xs text-gray-500 mb-1 block">Rolle</label>
            <select value={rolleId} onChange={(e) => setRolleId(Number(e.target.value))} className={selectCls}>
              {rollen.map((r) => <option key={r.id} value={r.id}>{r.bezeichnung} (×{Number(r.faktor).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })})</option>)}
            </select></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Eintrittsdatum <span className="text-gray-300">(optional)</span></label>
            <input type="date" value={eintritt} onChange={(e) => setEintritt(e.target.value)} className={inputCls} /></div>
          {fehler && <p className="text-xs text-red-600">{fehler}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Abbrechen</Button>
            <Button type="submit" variant="primary" size="sm" loading={creating} disabled={creating}>Anlegen</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Admin-Tab ────────────────────────────────────────────────────────────────

function AdminTab({ currentId }: { currentId: number }) {
  const [users,    setUsers]    = useState<AdminUser[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [fehler,   setFehler]   = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [passwort, setPasswort] = useState('');
  const [rolle,    setRolle]    = useState<'admin' | 'superadmin'>('admin');
  const [creating, setCreating] = useState(false);
  const [formErr,  setFormErr]  = useState<string | null>(null);

  const laden = useCallback(async () => {
    setLoading(true); setFehler(null);
    try { setUsers(await getAdminUsers()); }
    catch { setFehler('Benutzerliste konnte nicht geladen werden.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true); setFormErr(null);
    try {
      await createAdminUser({ name: name.trim(), email: email.trim(), passwort, rolle });
      setName(''); setEmail(''); setPasswort(''); setRolle('admin');
      setFormOpen(false); await laden();
    } catch { setFormErr('Anlegen fehlgeschlagen. E-Mail prüfen und Passwort mind. 10 Zeichen.'); }
    finally   { setCreating(false); }
  };

  if (loading) return <div className="space-y-3">{[0,1].map((i) => <SkeletonCard key={i} />)}</div>;
  if (fehler)  return <p className="text-sm text-red-600 py-6 text-center">{fehler}</p>;

  return (
    <>
      {editUser && (
        <AdminEditModal user={editUser} onClose={() => setEditUser(null)} onSaved={laden} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Admin-Benutzer</CardTitle>
          <Button variant="primary" size="sm" onClick={() => setFormOpen((v) => !v)}>
            {formOpen ? 'Abbrechen' : '+ Neuer Admin'}
          </Button>
        </CardHeader>

        {formOpen && (
          <form onSubmit={handleCreate} className="mb-6 p-4 bg-gray-50 rounded-xl space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="text-xs text-gray-500 mb-1 block">Name</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Max Mustermann" className={inputCls} /></div>
              <div><label className="text-xs text-gray-500 mb-1 block">E-Mail</label>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="max@firma.de" className={inputCls} /></div>
              <div><label className="text-xs text-gray-500 mb-1 block">Passwort (mind. 10 Zeichen)</label>
                <input required type="password" minLength={10} value={passwort} onChange={(e) => setPasswort(e.target.value)} placeholder="••••••••••" className={inputCls} /></div>
              <div><label className="text-xs text-gray-500 mb-1 block">Rolle</label>
                <select value={rolle} onChange={(e) => setRolle(e.target.value as 'admin' | 'superadmin')} className={selectCls}>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Superadmin</option>
                </select></div>
            </div>
            {formErr && <p className="text-xs text-red-600">{formErr}</p>}
            <div className="flex justify-end">
              <Button type="submit" variant="primary" size="sm" loading={creating} disabled={creating}>Anlegen</Button>
            </div>
          </form>
        )}

        <div className="divide-y divide-gray-50">
          {users.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Keine Admins gefunden.</p>}
          {users.map((u) => {
            const isSelf = u.id === currentId;
            return (
              <div key={u.id} className="py-2.5">
                <div className="flex items-start gap-2.5">
                  <Avatar name={u.name} active={u.aktiv} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-gray-900 truncate">{u.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${u.rolle === 'superadmin' ? 'bg-purple-100 text-purple-700' : 'bg-info-100 text-info-700'}`}>
                        {u.rolle}
                      </span>
                      {!u.aktiv && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">inaktiv</span>}
                      {isSelf  && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Du</span>}
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">{u.email}</p>
                    <p className="text-[10px] text-gray-400">Login: {fmt(u.letzterLogin)}</p>
                  </div>
                </div>
                <div className="mt-1.5 flex gap-1.5 flex-wrap pl-11">
                  <Button variant="secondary" size="xs" onClick={() => setEditUser(u)}>Bearbeiten</Button>
                  {!isSelf && u.aktiv  && <Button variant="secondary" size="xs" onClick={async () => { if (confirm(`"${u.name}" deaktivieren?`)) { await deactivateAdmin(u.id); laden(); } }}>Deaktivieren</Button>}
                  {!isSelf && !u.aktiv && <Button variant="secondary" size="xs" onClick={async () => { await reactivateAdmin(u.id); laden(); }}>Reaktivieren</Button>}
                  {!isSelf && <Button variant="secondary" size="xs" onClick={async () => { if (confirm(`"${u.name}" endgültig löschen?`)) { await deleteAdminUser(u.id); laden(); } }} className="!text-red-600 hover:!bg-red-50 hover:!border-red-200">Löschen</Button>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Hinweise</CardTitle></CardHeader>
        <ul className="text-sm text-gray-500 space-y-1 list-disc list-inside">
          <li>Passwörter müssen mindestens 10 Zeichen lang sein.</li>
          <li>Beim Bearbeiten kann das Passwortfeld leer bleiben — es bleibt dann unverändert.</li>
          <li>Superadmins können Benutzer anlegen, bearbeiten, deaktivieren und löschen.</li>
          <li>Das eigene Konto kann nicht deaktiviert oder gelöscht werden.</li>
        </ul>
      </Card>
    </>
  );
}

// ─── Mitarbeiter-Tab ──────────────────────────────────────────────────────────

function MitarbeiterTab() {
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [rollen,      setRollen]      = useState<Rolle[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [fehler,      setFehler]      = useState<string | null>(null);
  const [syncing,     setSyncing]     = useState(false);
  const [syncMsg,     setSyncMsg]     = useState<string | null>(null);
  const [editMA,      setEditMA]      = useState<Mitarbeiter | null>(null);
  const [neuOpen,     setNeuOpen]     = useState(false);
  const [filter,      setFilter]      = useState<'alle' | 'aktiv' | 'inaktiv'>('aktiv');

  const laden = useCallback(async () => {
    setLoading(true); setFehler(null);
    try {
      const [ma, ro] = await Promise.all([getMitarbeiter(), getRollen()]);
      setMitarbeiter(ma);
      setRollen(ro);
    } catch { setFehler('Mitarbeiterliste konnte nicht geladen werden.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const r = await syncMitarbeiter();
      setSyncMsg(`Sync erfolgreich: ${r.angelegt} neu, ${r.aktualisiert} aktualisiert${r.fehler?.length ? `, ${r.fehler.length} Warnungen` : ''}.`);
      await laden();
    } catch {
      setSyncMsg('Sync fehlgeschlagen — Partner-API nicht erreichbar.');
    } finally {
      setSyncing(false);
    }
  };

  const filtered = mitarbeiter.filter((m) =>
    filter === 'alle'    ? true :
    filter === 'aktiv'   ? m.aktiv :
    /* inaktiv */          !m.aktiv
  );

  if (loading) return <div className="space-y-3">{[0,1,2].map((i) => <SkeletonCard key={i} />)}</div>;
  if (fehler)  return <p className="text-sm text-red-600 py-6 text-center">{fehler}</p>;

  return (
    <>
      {editMA  && <MAEditModal  ma={editMA} rollen={rollen} onClose={() => setEditMA(null)} onSaved={laden} />}
      {neuOpen && <MANeuModal   rollen={rollen}             onClose={() => setNeuOpen(false)} onSaved={laden} />}

      <Card>
        <CardHeader>
          <CardTitle>Mitarbeiter</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="secondary" size="sm" loading={syncing} disabled={syncing} onClick={handleSync}>
              {syncing ? 'Importiere…' : '↻ Aus Fristd-Bau'}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setNeuOpen(true)}>
              + Neuer Mitarbeiter
            </Button>
          </div>
        </CardHeader>

        {syncMsg && (
          <div className={`mb-4 text-xs px-3 py-2 rounded-lg ${syncMsg.includes('fehlgeschlagen') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {syncMsg}
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2 mb-4">
          {(['aktiv', 'inaktiv', 'alle'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                filter === f ? 'bg-info-100 text-info-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {f === 'alle' ? 'Alle' : f === 'aktiv' ? 'Aktiv' : 'Inaktiv'}
              <span className="ml-1 opacity-60">
                ({f === 'alle' ? mitarbeiter.length : f === 'aktiv' ? mitarbeiter.filter((m) => m.aktiv).length : mitarbeiter.filter((m) => !m.aktiv).length})
              </span>
            </button>
          ))}
        </div>

        <div className="divide-y divide-gray-50">
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              {mitarbeiter.length === 0
                ? 'Noch keine Mitarbeiter — manuell anlegen oder aus Fristd-Bau importieren.'
                : 'Keine Mitarbeiter in dieser Kategorie.'}
            </p>
          )}
          {filtered.map((m) => (
            <div key={m.id} className="py-2.5">
              <div className="flex items-start gap-2.5">
                <Avatar name={m.vorname} active={m.aktiv} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-gray-900">{m.vorname} {m.nachname}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-info-50 text-info-700 font-medium">
                      {m.rolle.bezeichnung} ×{Number(m.rolle.faktor).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </span>
                    {!m.aktiv && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">inaktiv</span>}
                    {m.externeId && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
                        FriStD {m.personalNummer ? `#${m.personalNummer}` : '✓'}
                      </span>
                    )}
                  </div>
                  {m.email && (
                    <p className="text-[10px] text-info-600 truncate">{m.email}</p>
                  )}
                  {!m.email && m.externeId && (
                    <p className="text-[10px] text-amber-500">Keine E-Mail — bitte Sync starten</p>
                  )}
                  <p className="text-[10px] text-gray-400">
                    {m.kranktageAktuellesJahr} Kranktage · {m.auszahlungspraeferenz === 'geld' ? 'Geld' : 'Freizeit'}
                    {m.eintrittsdatum ? ` · seit ${fmtD(m.eintrittsdatum)}` : ''}
                  </p>
                </div>
              </div>
              <div className="mt-1.5 flex gap-1.5 flex-wrap pl-11">
                <Button variant="secondary" size="xs" onClick={() => setEditMA(m)}>Bearbeiten</Button>
                {m.aktiv
                  ? <Button variant="secondary" size="xs" onClick={async () => { if (confirm(`"${m.vorname} ${m.nachname}" deaktivieren?`)) { await deactivateMA(m.id); laden(); } }}>Deaktivieren</Button>
                  : <Button variant="secondary" size="xs" onClick={async () => { await reactivateMA(m.id); laden(); }}>Reaktivieren</Button>
                }
                <Button variant="secondary" size="xs" onClick={async () => { if (confirm(`"${m.vorname} ${m.nachname}" endgültig löschen?`)) { await deleteMitarbeiter(m.id); laden(); } }} className="!text-red-600 hover:!bg-red-50 hover:!border-red-200">Löschen</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Hinweise</CardTitle></CardHeader>
        <ul className="text-sm text-gray-500 space-y-1 list-disc list-inside">
          <li>„Aus Fristd-Bau importieren" synchronisiert alle Mitarbeiter aus der Zeiterfassungs-App.</li>
          <li>Importierte Mitarbeiter werden mit ihrer FriStD-ID markiert und automatisch aktuell gehalten.</li>
          <li>Manuell angelegte Mitarbeiter werden beim Import nicht überschrieben.</li>
          <li>Lokal gesetzte Felder (Kranktage, Präferenz) bleiben auch nach dem Import erhalten.</li>
        </ul>
      </Card>
    </>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function AdminBenutzer() {
  const { state } = useAuth();
  const isSuperadmin = state.status === 'admin' && state.user.rolle === 'superadmin';
  const currentId    = state.status === 'admin' ? state.user.id : -1;

  const [tab, setTab] = useState<'admins' | 'mitarbeiter'>('admins');

  const [adminCount, setAdminCount] = useState(0);
  const [maCount,    setMaCount]    = useState(0);

  useEffect(() => {
    if (!isSuperadmin) return;
    getAdminUsers().then((u) => setAdminCount(u.length)).catch(() => {});
    getMitarbeiter().then((m) => setMaCount(m.length)).catch(() => {});
  }, [isSuperadmin]);

  if (!isSuperadmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">Nur Superadmins können Benutzer verwalten.</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <Tabs active={tab} onChange={setTab} counts={{ admins: adminCount, mitarbeiter: maCount }} />
      {tab === 'admins'      && <AdminTab       currentId={currentId} />}
      {tab === 'mitarbeiter' && <MitarbeiterTab />}
    </div>
  );
}
