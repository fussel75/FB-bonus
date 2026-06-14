/**
 * Mitarbeiter-Login
 *
 * Anmeldung mit E-Mail-Adresse und Passwort.
 * „Passwort vergessen" zeigt einen Hinweis, sich an den Admin zu wenden.
 */

import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';

export default function MitarbeiterLogin() {
  const { loginMitarbeiter, isAuthenticated, isMitarbeiter, state } = useAuth();
  const navigate = useNavigate();

  const [email,         setEmail]         = useState('');
  const [passwort,      setPasswort]      = useState('');
  const [zeigPasswort,  setZeigPasswort]  = useState(false);
  const [zeigHilfe,     setZeigHilfe]     = useState(false);
  const [remember,      setRemember]      = useState(false);

  const isLoading  = state.status === 'loading';
  const fehler     = state.status === 'error' ? state.message : null;
  const inputValid = email.trim().length > 0 && passwort.length > 0;

  useEffect(() => {
    if (isAuthenticated && isMitarbeiter) navigate('/mitarbeiter/dashboard', { replace: true });
  }, [isAuthenticated, isMitarbeiter, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!inputValid) return;
    await loginMitarbeiter(email.trim().toLowerCase(), passwort, remember);
  }

  const inputClass = [
    'w-full px-4 py-3 text-base border rounded-xl',
    'focus:outline-none focus:ring-2 focus:ring-info-500 focus:border-transparent transition-shadow',
    'border-gray-200 bg-white',
  ].join(' ');

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
          <p className="text-sm text-gray-500 mt-1">Dein persönlicher Bonusstand</p>
        </div>

        {/* Formular */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Anmelden</h2>
          <p className="text-xs text-gray-500 mb-5">
            Gib deine E-Mail-Adresse und dein Passwort ein.
          </p>

          {fehler && (
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-malus-50 border border-malus-200 text-sm text-malus-700">
              {fehler}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* E-Mail */}
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-gray-600 mb-1.5">
                E-Mail-Adresse
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="Deine E-Mail-Adresse"
              />
            </div>

            {/* Passwort */}
            <div>
              <label htmlFor="passwort" className="block text-xs font-medium text-gray-600 mb-1.5">
                Passwort
              </label>
              <div className="relative">
                <input
                  id="passwort"
                  type={zeigPasswort ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={passwort}
                  onChange={(e) => setPasswort(e.target.value)}
                  className={`${inputClass} pr-12`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setZeigPasswort((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3.5 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={zeigPasswort ? 'Passwort verbergen' : 'Passwort anzeigen'}
                >
                  {zeigPasswort ? (
                    // Auge durchgestrichen
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/>
                    </svg>
                  ) : (
                    // Auge
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
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
                className="w-4 h-4 rounded border-gray-300 text-info-600 focus:ring-info-500 cursor-pointer"
              />
              <span className="text-xs text-gray-600">Angemeldet bleiben (30 Tage)</span>
            </label>

            <Button
              type="submit"
              variant="success"
              size="lg"
              fullWidth
              loading={isLoading}
              disabled={!inputValid || isLoading}
            >
              Anmelden
            </Button>
          </form>

          {/* Passwort vergessen */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setZeigHilfe((v) => !v)}
              className="text-xs text-gray-400 hover:text-info-600 transition-colors"
            >
              Passwort vergessen?
            </button>
            {zeigHilfe && (
              <div className="mt-3 px-3 py-3 rounded-lg bg-info-50 border border-info-200 text-left">
                <p className="text-xs text-info-800 font-medium mb-1">Kein Problem</p>
                <p className="text-xs text-info-700">
                  Bitte wende dich an deinen Vorgesetzten oder den BonusTrack-Administrator.
                  Er kann dir ein neues Passwort setzen.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Admin-Link */}
        <p className="text-center text-xs text-gray-400 mt-4">
          Admin?{' '}
          <a href="/admin/login" className="text-info-600 hover:text-info-700 font-medium">
            Zum Admin-Login
          </a>
        </p>
      </div>
    </div>
  );
}
