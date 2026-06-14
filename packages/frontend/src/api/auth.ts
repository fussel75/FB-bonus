import { apiClient } from './client';
import type { AdminUser, MitarbeiterUser } from '../types';

export interface AdminLoginResponse {
  token: string;
  admin: AdminUser;
}

export interface MitarbeiterLoginResponse {
  token:       string;
  mitarbeiter: MitarbeiterUser;
}

export const authApi = {
  async adminLogin(email: string, passwort: string, remember = false): Promise<AdminLoginResponse> {
    const res = await apiClient.post<{ success: true; data: AdminLoginResponse }>(
      '/auth/login',
      { email, passwort, remember },
    );
    return res.data.data;
  },

  async mitarbeiterLogin(email: string, passwort: string, remember = false): Promise<MitarbeiterLoginResponse> {
    const res = await apiClient.post<{ success: true; data: MitarbeiterLoginResponse }>(
      '/mitarbeiter-auth/login',
      { email, passwort, remember },
    );
    return res.data.data;
  },

  async setMitarbeiterPasswort(mitarbeiterId: number, passwort: string): Promise<void> {
    await apiClient.post('/mitarbeiter-auth/set-password', { mitarbeiterId, passwort });
  },

  async adminLogout(): Promise<void> {
    await apiClient.post('/auth/logout').catch(() => {/* ignorieren */});
  },
};
