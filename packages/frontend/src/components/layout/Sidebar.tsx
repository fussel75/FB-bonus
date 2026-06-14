import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

// ── Icons (Inline-SVG, kein Icon-Paket nötig) ─────────────────────────────

const icons = {
  dashboard:    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  mitarbeiter:  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  projekte:     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>,
  bonus:        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  prognose:     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>,
  auszahlungen: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>,
  konfig:       <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  abschluss:    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>,
  archiv:       <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>,
  benutzer:     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>,
  historie:     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>,
  einstellungen:<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>,
  logout:       <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>,
};

// ── Nav-Definitionen ───────────────────────────────────────────────────────

const adminNav = [
  { to: '/admin/dashboard',      label: 'Dashboard',      icon: icons.dashboard },
  { to: '/admin/mitarbeiter',    label: 'Mitarbeiter',    icon: icons.mitarbeiter },
  { to: '/admin/projekte',       label: 'Projekte',       icon: icons.projekte },
  { to: '/admin/bonus',          label: 'Bonus',          icon: icons.bonus },
  { to: '/admin/prognose',       label: 'Prognose',       icon: icons.prognose },
  { to: '/admin/auszahlungen',   label: 'Auszahlungen',   icon: icons.auszahlungen },
  { to: '/admin/konfiguration',  label: 'Konfiguration',  icon: icons.konfig },
  { to: '/admin/jahresabschluss',label: 'Jahresabschluss',icon: icons.abschluss },
  { to: '/admin/archiv',         label: 'Projektarchiv',   icon: icons.archiv },
  { to: '/admin/benutzer',       label: 'Benutzer',        icon: icons.benutzer },
];

const mitarbeiterNav = [
  { to: '/mitarbeiter/dashboard', label: 'Mein Bonus',     icon: icons.bonus },
  { to: '/mitarbeiter/projekte',  label: 'Projekte',        icon: icons.projekte },
  { to: '/mitarbeiter/historie',  label: 'Buchungshistorie',icon: icons.historie },
  { to: '/mitarbeiter/einstellungen', label: 'Einstellungen', icon: icons.einstellungen },
];

// ── Gemeinsame NavItem-Komponente ─────────────────────────────────────────

function NavItem({ to, label, icon, onClick }: { to?: string; label: string; icon: React.ReactNode; onClick?: () => void }) {
  const baseClass = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150';
  const activeClass   = 'bg-info-50 text-info-700';
  const inactiveClass = 'text-gray-600 hover:bg-gray-100 hover:text-gray-900';

  if (!to) {
    return (
      <button onClick={onClick} className={`${baseClass} ${inactiveClass} w-full text-left`}>
        <span className="flex-shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </button>
    );
  }

  return (
    <NavLink
      to={to}
      className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

// ── Sidebar-Komponente ────────────────────────────────────────────────────

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const { isAdmin, adminUser, mitarbeiterUser, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = isAdmin ? adminNav : mitarbeiterNav;
  const userName = isAdmin
    ? adminUser?.name
    : mitarbeiterUser ? `${mitarbeiterUser.vorname} ${mitarbeiterUser.nachname}` : '';
  const userSub  = isAdmin ? adminUser?.rolle : mitarbeiterUser?.rolle;

  function handleLogout() {
    logout();
    navigate(isAdmin ? '/admin/login' : '/login');
  }

  return (
    <aside className="flex flex-col h-full bg-white border-r border-gray-100 w-64">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-gray-100 flex-shrink-0">
        <img src="/erfolgsbonus-logo.png" alt="ErfolgsBonus" className="h-10 w-auto flex-shrink-0" />
        <span className="font-bold text-gray-900 text-base tracking-tight">Mein Bonus</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {navItems.map((item) => (
          <NavItem key={item.to} {...item} onClick={onClose} />
        ))}
      </nav>

      {/* User-Footer */}
      <div className="px-3 py-3 border-t border-gray-100 flex-shrink-0 space-y-0.5">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="w-8 h-8 rounded-full bg-info-100 text-info-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
            {userName?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
            <p className="text-xs text-gray-500 truncate capitalize">{userSub}</p>
          </div>
        </div>
        <NavItem label="Abmelden" icon={icons.logout} onClick={handleLogout} />
      </div>
    </aside>
  );
}
