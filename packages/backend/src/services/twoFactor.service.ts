/**
 * twoFactor.service.ts — TOTP-basierte 2FA für Admin-Logins
 *
 * - Setup: generiere Secret, zeige QR-Code, MA scannt in Authenticator-App
 * - Verifizierung: TOTP-Token aus App prüfen
 * - Backup-Codes: 10 Einmal-Codes für Notfall (Bcrypt-gehasht)
 */

import { authenticator } from 'otplib';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import { prisma } from '../db/client';

authenticator.options = {
  window: 1, // ±1 30-Sek-Slot Toleranz für Uhren-Drift
};

function generateBackupCode(): string {
  // 10 Zeichen, Großbuchstaben+Zahlen (kein 0/O/1/I zur besseren Lesbarkeit)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('').replace(/(.{5})/, '$1-');
}

export const twoFactorService = {
  /** Schritt 1: Setup starten — Secret + QR-Code für Admin generieren */
  async setupBeginnen(adminId: number, issuer = 'BonusTrack') {
    const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) throw new Error('Admin nicht gefunden');

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(admin.email, issuer, secret);
    const qrCode = await QRCode.toDataURL(otpauth);

    // Provisorisch speichern (noch NICHT aktiviert)
    await prisma.adminUser.update({
      where: { id: adminId },
      data:  { twoFactorSecret: secret, twoFactorEnabled: false },
    });

    return { secret, otpauth, qrCode };
  },

  /** Schritt 2: Setup bestätigen — User gibt ersten Code ein, wir aktivieren */
  async setupBestaetigen(adminId: number, token: string): Promise<{ backupCodes: string[] }> {
    const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin || !admin.twoFactorSecret) throw new Error('Setup nicht gestartet');

    const ok = authenticator.verify({ token, secret: admin.twoFactorSecret });
    if (!ok) throw new Error('Code falsch — bitte erneut versuchen');

    const backupCodes = Array.from({ length: 10 }, () => generateBackupCode());
    const hashed = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));

    await prisma.adminUser.update({
      where: { id: adminId },
      data:  {
        twoFactorEnabled:     true,
        twoFactorBackupCodes: JSON.stringify(hashed),
      },
    });

    return { backupCodes };
  },

  /** Beim Login: TOTP- oder Backup-Code prüfen */
  async verifyLogin(adminId: number, token: string): Promise<boolean> {
    const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin || !admin.twoFactorEnabled || !admin.twoFactorSecret) return true; // 2FA nicht aktiv → OK

    // TOTP-Code prüfen
    if (token.match(/^\d{6}$/)) {
      return authenticator.verify({ token, secret: admin.twoFactorSecret });
    }

    // Backup-Code prüfen (10-12 Zeichen alphanumerisch)
    const normalized = token.toUpperCase().replace(/[-\s]/g, '');
    if (normalized.length < 8) return false;

    const codes: string[] = admin.twoFactorBackupCodes ? JSON.parse(admin.twoFactorBackupCodes) : [];
    for (let i = 0; i < codes.length; i++) {
      const matches = await bcrypt.compare(token.toUpperCase(), codes[i]);
      if (matches) {
        // Code "verbrennen" — kann nur einmal benutzt werden
        const remaining = codes.filter((_, idx) => idx !== i);
        await prisma.adminUser.update({
          where: { id: adminId },
          data:  { twoFactorBackupCodes: JSON.stringify(remaining) },
        });
        return true;
      }
    }
    return false;
  },

  async deaktivieren(adminId: number) {
    await prisma.adminUser.update({
      where: { id: adminId },
      data:  {
        twoFactorEnabled:     false,
        twoFactorSecret:      null,
        twoFactorBackupCodes: null,
      },
    });
  },

  async status(adminId: number) {
    const admin = await prisma.adminUser.findUnique({
      where:  { id: adminId },
      select: { twoFactorEnabled: true, twoFactorBackupCodes: true },
    });
    const remaining = admin?.twoFactorBackupCodes ? JSON.parse(admin.twoFactorBackupCodes).length : 0;
    return { enabled: admin?.twoFactorEnabled ?? false, backupCodesRemaining: remaining };
  },
};
