/**
 * api/client.ts
 *
 * Zentrale Axios-Instanz mit JWT-Interceptor.
 * Token wird aus localStorage gelesen.
 * Bei 401: automatisch ausloggen + Redirect auf Login.
 */

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request-Interceptor: JWT anhängen ───────────────────────────────────────
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('bt_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response-Interceptor: 401 → ausloggen ───────────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      // Token abgelaufen oder ungültig
      localStorage.removeItem('bt_token');
      localStorage.removeItem('bt_user');
      localStorage.removeItem('bt_user_typ');

      // Soft redirect: UserTyp bestimmen und zur richtigen Login-Seite
      const userTyp = localStorage.getItem('bt_user_typ');
      const loginPath = userTyp === 'admin' ? '/admin/login' : '/login';
      if (window.location.pathname !== loginPath) {
        window.location.href = loginPath;
      }
    }
    return Promise.reject(error);
  },
);

// ─── Hilfsfunktion: Fehlermeldung extrahieren ────────────────────────────────
export function extractApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string } | undefined;
    return data?.error ?? error.message ?? 'Unbekannter Fehler';
  }
  if (error instanceof Error) return error.message;
  return 'Unbekannter Fehler';
}
