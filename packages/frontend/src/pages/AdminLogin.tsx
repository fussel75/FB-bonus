import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export default function AdminLogin() {
  const { loginAdmin, isAuthenticated, isAdmin, state } = useAuth();
  const navigate = useNavigate();

  const [email,    setEmail]    = useState('');
  const [passwort, setPasswort] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [remember, setRemember] = useState(false);

  const isLoading = state.status === 'loading';
  const fehler    = state.status === 'error' ? state.message : null;

  useEffect(() => {
    if (isAuthenticated && isAdmin) navigate('/admin/dashboard', { replace: true });
  }, [isAuthenticated, isAdmin, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await loginAdmin(email.trim(), passwort, remember);
  }

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-bonus-500 focus:border-transparent transition-shadow';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fadeIn">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="/erfolgsbonus-logo.png"
            alt="ErfolgsBonus Logo"
            className="h-28 w-auto mb-2 drop-shadow-md"
          />
          <h1 className="text-xl font-bold text-gray-900">Mein Bonus</h1>
          <p className="text-sm text-gray-500 mt-1">Admin-Bereich</p>
        </div>

        {/* Formular */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Anmelden</h2>
          <p className="text-xs text-gray-500 mb-5">
            Gib deine E-Mail-Adresse und dein Passwort ein.
          </p>

          {fehler && (
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-malus-50 border border-malus-200 text-sm text-malus-700 flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
              </svg>
              {fehler}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-gray-600 mb-1.5">
                E-Mail-Adresse
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="admin@beispiel.de"
              />
            </div>

            <div>
              <label htmlFor="passwort" className="block text-xs font-medium text-gray-600 mb-1.5">
                Passwort
              </label>
              <div className="relative">
                <input
                  id="passwort"
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={passwort}
                  onChange={(e) => setPasswort(e.target.value)}
                  className={`${inputClass} pr-12`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3.5 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                  aria-label={showPw ? 'Passwort verbergen' : 'Passwort anzeigen'}
                >
                  {showPw ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-bonus-600 focus:ring-bonus-500 cursor-pointer"
              />
              <span className="text-xs text-gray-600">Angemeldet bleiben (30 Tage)</span>
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-bonus-600 hover:bg-bonus-700 disabled:bg-bonus-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Anmelden…
                </>
              ) : 'Anmelden'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Mitarbeiter?{' '}
          <a href="/login" className="text-bonus-600 hover:text-bonus-700 font-medium">
            Zum Mitarbeiter-Login
          </a>
        </p>
      </div>
    </div>
  );
}
