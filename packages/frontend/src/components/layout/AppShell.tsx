/**
 * AppShell — Haupt-Layout mit Sidebar + Content-Bereich
 *
 * Desktop: Sidebar links fest, Content rechts scrollbar
 * Mobile:  Sidebar als Overlay-Drawer (Slide-in von links)
 *
 * Wird von ProtectedRoute gerendert sobald der User eingeloggt ist.
 */

import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

// Seitentitel aus Route-Pfad ableiten
function resolvePageTitle(pathname: string): { title: string; subtitle?: string } {
  const map: Record<string, { title: string; subtitle?: string }> = {
    '/admin/dashboard':       { title: 'Dashboard',        subtitle: 'Übersicht & KPIs' },
    '/admin/mitarbeiter':     { title: 'Mitarbeiter',      subtitle: 'Stammdaten & Konten' },
    '/admin/projekte':        { title: 'Projekte',         subtitle: 'Soll/Ist-Vergleich' },
    '/admin/bonus':           { title: 'Bonus-Übersicht',  subtitle: 'Alle Konten im Überblick' },
    '/admin/prognose':        { title: 'Prognose',         subtitle: 'Hochrechnung Jahresende' },
    '/admin/auszahlungen':    { title: 'Auszahlungen',     subtitle: 'Status & Freigabe' },
    '/admin/konfiguration':   { title: 'Konfiguration',    subtitle: 'Systemparameter' },
    '/admin/jahresabschluss': { title: 'Jahresabschluss',  subtitle: '5-Schritt-Workflow' },
    '/admin/archiv':          { title: 'Projektarchiv',      subtitle: 'Abgerechnete Projekte' },
    '/admin/benutzer':        { title: 'Benutzerverwaltung', subtitle: 'Admin-Konten & Passwörter' },
    '/mitarbeiter/dashboard': { title: 'Mein Bonus',       subtitle: 'Dein Jahresbonus auf einen Blick' },
    '/mitarbeiter/projekte':  { title: 'Meine Projekte',   subtitle: 'Aktueller Anteil & Fortschritt' },
    '/mitarbeiter/historie':  { title: 'Buchungshistorie', subtitle: 'Alle Gutschriften & Buchungen' },
    '/mitarbeiter/einstellungen': { title: 'Einstellungen', subtitle: 'Profil & Präferenzen' },
  };

  return map[pathname] ?? { title: 'BonusTrack' };
}

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { title, subtitle } = resolvePageTitle(location.pathname);

  // Sidebar bei Navigation schließen (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Sidebar bei Resize schließen (wenn >= lg)
  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 1024) setSidebarOpen(false); };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Desktop-Sidebar (fest) ───────────────────────────────────────── */}
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* ── Mobile-Sidebar (Overlay) ─────────────────────────────────────── */}
      {sidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden animate-slideIn">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </>
      )}

      {/* ── Haupt-Content ────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          title={title}
          subtitle={subtitle}
          onMenuClick={() => setSidebarOpen(true)}
        />

        {/* Scrollbarer Content-Bereich */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
