import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AppShell } from '@/components/layout/AppShell';

// Seiten
import AdminLogin        from '@/pages/AdminLogin';
import MitarbeiterLogin  from '@/pages/MitarbeiterLogin';

// Admin-Seiten
import AdminDashboard     from '@/pages/admin/Dashboard';
import AdminProjekte      from '@/pages/admin/Projekte';
import AdminMitarbeiter   from '@/pages/admin/Mitarbeiter';
import AdminKonfiguration from '@/pages/admin/Konfiguration';
import AdminAuszahlungen  from '@/pages/admin/Auszahlungen';
import AdminPrognose        from '@/pages/admin/Prognose';
import AdminJahresabschluss  from '@/pages/admin/Jahresabschluss';
import AdminBenutzer         from '@/pages/admin/Benutzer';
import AdminBonusUebersicht  from '@/pages/admin/BonusUebersicht';
import AdminArchiv           from '@/pages/admin/Archiv';
import ProjektBericht        from '@/pages/admin/ProjektBericht';

// Mitarbeiter-Seiten
import MitarbeiterDashboard  from '@/pages/mitarbeiter/Dashboard';
import MitarbeiterProjekte   from '@/pages/mitarbeiter/Projekte';
import Buchungshistorie       from '@/pages/mitarbeiter/Buchungshistorie';
import Einstellungen          from '@/pages/mitarbeiter/Einstellungen';

// ─── Protected Route ──────────────────────────────────────────────────────────

interface ProtectedProps {
  children:       React.ReactNode;
  requiredTyp:    'admin' | 'mitarbeiter';
  redirectTo:     string;
}

function Protected({ children, requiredTyp, redirectTo }: ProtectedProps) {
  const { isAuthenticated, userTyp, state } = useAuth();

  // Noch am Laden (Token-Wiederherstellung)
  if (state.status === 'idle') return null;

  if (!isAuthenticated || userTyp !== requiredTyp) {
    return <Navigate to={redirectTo} replace />;
  }
  return <>{children}</>;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>

          {/* ── Root-Redirect ─────────────────────────────────────────── */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* ── Mitarbeiter-Login ─────────────────────────────────────── */}
          <Route path="/login" element={<MitarbeiterLogin />} />

          {/* ── Admin-Login ───────────────────────────────────────────── */}
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* ── Mitarbeiter-Bereich ───────────────────────────────────── */}
          <Route
            path="/mitarbeiter"
            element={
              <Protected requiredTyp="mitarbeiter" redirectTo="/login">
                <AppShell />
              </Protected>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard"    element={<MitarbeiterDashboard />} />
            <Route path="projekte"      element={<MitarbeiterProjekte />} />
            <Route path="historie"      element={<Buchungshistorie />} />
            <Route path="einstellungen" element={<Einstellungen />} />
          </Route>

          {/* ── Admin-Bereich ─────────────────────────────────────────── */}
          <Route
            path="/admin"
            element={
              <Protected requiredTyp="admin" redirectTo="/admin/login">
                <AppShell />
              </Protected>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard"        element={<AdminDashboard />} />
            <Route path="mitarbeiter"      element={<AdminMitarbeiter />} />
            <Route path="projekte"         element={<AdminProjekte />} />
            <Route path="bonus"            element={<AdminBonusUebersicht />} />
            <Route path="prognose"         element={<AdminPrognose />} />
            <Route path="auszahlungen"     element={<AdminAuszahlungen />} />
            <Route path="konfiguration"    element={<AdminKonfiguration />} />
            <Route path="jahresabschluss"  element={<AdminJahresabschluss />} />
            <Route path="archiv"           element={<AdminArchiv />} />
            <Route path="benutzer"         element={<AdminBenutzer />} />
          </Route>

          {/* ── Projektbericht (ohne AppShell, geschützt) ─────────────── */}
          <Route
            path="/admin/projekte/:id/bericht"
            element={
              <Protected requiredTyp="admin" redirectTo="/admin/login">
                <ProjektBericht />
              </Protected>
            }
          />

          {/* ── 404 ───────────────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
