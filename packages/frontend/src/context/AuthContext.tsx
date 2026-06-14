/**
 * AuthContext.tsx
 *
 * Zwei getrennte Auth-Flows in einem Context:
 *   - Admin:       JWT enthält { sub, email, rolle, name }
 *   - Mitarbeiter: JWT enthält { sub, name, typ: 'mitarbeiter' }
 *
 * State wird in localStorage persistiert (Token + User-Objekt).
 * Beim App-Start wird der gespeicherte Token wiederhergestellt.
 */

import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { authApi } from '../api/auth';
import { extractApiError } from '../api/client';
import type { AdminUser, MitarbeiterUser, UserTyp } from '../types';

// ─── State-Typen ─────────────────────────────────────────────────────────────

type AuthState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'admin';       user: AdminUser;       token: string }
  | { status: 'mitarbeiter'; user: MitarbeiterUser; token: string }
  | { status: 'error';       message: string };

type AuthAction =
  | { type: 'LOADING' }
  | { type: 'LOGIN_ADMIN';       user: AdminUser;       token: string }
  | { type: 'LOGIN_MITARBEITER'; user: MitarbeiterUser; token: string }
  | { type: 'LOGOUT' }
  | { type: 'ERROR'; message: string };

// ─── Reducer ─────────────────────────────────────────────────────────────────

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOADING':
      return { status: 'loading' };
    case 'LOGIN_ADMIN':
      return { status: 'admin', user: action.user, token: action.token };
    case 'LOGIN_MITARBEITER':
      return { status: 'mitarbeiter', user: action.user, token: action.token };
    case 'LOGOUT':
      return { status: 'idle' };
    case 'ERROR':
      return { status: 'error', message: action.message };
    default:
      return state;
  }
}

// ─── Context-Interface ───────────────────────────────────────────────────────

interface AuthContextValue {
  state:             AuthState;
  isAdmin:           boolean;
  isMitarbeiter:     boolean;
  isAuthenticated:   boolean;
  userTyp:           UserTyp | null;
  adminUser:         AdminUser | null;
  mitarbeiterUser:   MitarbeiterUser | null;
  loginAdmin:        (email: string, passwort: string, remember?: boolean) => Promise<void>;
  loginMitarbeiter:  (email: string, passwort: string, remember?: boolean) => Promise<void>;
  logout:            () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Storage-Helpers ─────────────────────────────────────────────────────────

const STORAGE_TOKEN   = 'bt_token';
const STORAGE_USER    = 'bt_user';
const STORAGE_USERTYP = 'bt_user_typ';

function saveToStorage(token: string, user: AdminUser | MitarbeiterUser, typ: UserTyp) {
  localStorage.setItem(STORAGE_TOKEN,   token);
  localStorage.setItem(STORAGE_USER,    JSON.stringify(user));
  localStorage.setItem(STORAGE_USERTYP, typ);
}

function clearStorage() {
  localStorage.removeItem(STORAGE_TOKEN);
  localStorage.removeItem(STORAGE_USER);
  localStorage.removeItem(STORAGE_USERTYP);
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, { status: 'idle' });

  // Beim Mount: gespeicherten Auth-State wiederherstellen
  useEffect(() => {
    const token   = localStorage.getItem(STORAGE_TOKEN);
    const userRaw = localStorage.getItem(STORAGE_USER);
    const userTyp = localStorage.getItem(STORAGE_USERTYP) as UserTyp | null;

    if (token && userRaw && userTyp) {
      try {
        const user = JSON.parse(userRaw) as AdminUser | MitarbeiterUser;
        if (userTyp === 'admin') {
          dispatch({ type: 'LOGIN_ADMIN', user: user as AdminUser, token });
        } else {
          dispatch({ type: 'LOGIN_MITARBEITER', user: user as MitarbeiterUser, token });
        }
      } catch {
        clearStorage();
      }
    }
  }, []);

  const loginAdmin = useCallback(async (email: string, passwort: string, remember = false) => {
    dispatch({ type: 'LOADING' });
    try {
      const result = await authApi.adminLogin(email, passwort, remember);
      saveToStorage(result.token, result.admin, 'admin');
      dispatch({ type: 'LOGIN_ADMIN', user: result.admin, token: result.token });
    } catch (err) {
      dispatch({ type: 'ERROR', message: extractApiError(err) });
    }
  }, []);

  const loginMitarbeiter = useCallback(async (email: string, passwort: string, remember = false) => {
    dispatch({ type: 'LOADING' });
    try {
      const result = await authApi.mitarbeiterLogin(email, passwort, remember);
      saveToStorage(result.token, result.mitarbeiter, 'mitarbeiter');
      dispatch({ type: 'LOGIN_MITARBEITER', user: result.mitarbeiter, token: result.token });
    } catch (err) {
      dispatch({ type: 'ERROR', message: extractApiError(err) });
    }
  }, []);

  const logout = useCallback(() => {
    authApi.adminLogout().catch(() => {/* ignorieren */});
    clearStorage();
    dispatch({ type: 'LOGOUT' });
  }, []);

  const value: AuthContextValue = {
    state,
    isAdmin:          state.status === 'admin',
    isMitarbeiter:    state.status === 'mitarbeiter',
    isAuthenticated:  state.status === 'admin' || state.status === 'mitarbeiter',
    userTyp:          state.status === 'admin' ? 'admin'
                    : state.status === 'mitarbeiter' ? 'mitarbeiter'
                    : null,
    adminUser:        state.status === 'admin'       ? state.user : null,
    mitarbeiterUser:  state.status === 'mitarbeiter' ? state.user : null,
    loginAdmin,
    loginMitarbeiter,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden');
  return ctx;
}
