import { apiClient } from './client';
import type { MitarbeiterMe, BonusJahresübersicht, PrognoseErgebnis } from '../types';

export interface BonusBuchung {
  id:            number;
  mitarbeiterId: number;
  projektId:     number | null;
  typ:           'option_a' | 'option_b';
  stunden:       number;
  betragEur:     number;
  buchungsdatum: string;
  beschreibung:  string | null;
  erstelltAm:    string;
  projekt:       { id: number; projektname: string; projektnummer: string } | null;
}

export interface MeBonusResponse {
  berechnung:       BonusJahresübersicht;
  buchungshistorie: BonusBuchung[];
}

export const mitarbeiterApi = {
  async getMe(): Promise<MitarbeiterMe> {
    const res = await apiClient.get<{ success: true; data: MitarbeiterMe }>('/mitarbeiter-auth/me');
    return res.data.data;
  },

  async getMeBonus(jahr?: number): Promise<MeBonusResponse> {
    const params = jahr ? { jahr } : {};
    const res = await apiClient.get<{ success: true; data: MeBonusResponse }>(
      '/mitarbeiter-auth/me/bonus',
      { params },
    );
    return res.data.data;
  },

  async getMePrognose(jahr?: number): Promise<PrognoseErgebnis & { jahresfortschritt: number }> {
    const params = jahr ? { jahr } : {};
    const res = await apiClient.get<{
      success: true;
      data: PrognoseErgebnis & { jahresfortschritt: number };
    }>('/mitarbeiter-auth/me/prognose', { params });
    return res.data.data;
  },

  async setPraeferenz(praeferenz: 'geld' | 'freizeit'): Promise<void> {
    await apiClient.put('/mitarbeiter-auth/me/praeferenz', { praeferenz });
  },
};
