import './config/env'; // Zuerst laden & validieren
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import bcrypt from 'bcryptjs';
import { env } from './config/env';
import { prisma } from './db/client';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Routen
import uploadRoutes          from './routes/upload';
import authRoutes            from './routes/auth';
import mitarbeiterRoutes     from './routes/mitarbeiter';
import mitarbeiterAuthRoutes from './routes/mitarbeiter-auth';
import projekteRoutes        from './routes/projekte';
import bonusRoutes           from './routes/bonus';
import rollenRoutes          from './routes/rollen';
import konfigurationRoutes   from './routes/konfiguration';
import auszahlungenRoutes    from './routes/auszahlungen';
import syncRoutes            from './routes/sync';
import prognoseRoutes        from './routes/prognose';
import adminUserRoutes       from './routes/admin/users';
import jahresabschlussRoutes from './routes/admin/jahresabschluss';

const app = express();

// ─── Trust Proxy (für Reverse-Proxy wie Traefik/Nginx vor dem Container) ────
// Liest den ersten X-Forwarded-* Header — korrekt für genau einen Hop davor.
app.set('trust proxy', 1);

// ─── Security & Parsing ──────────────────────────────────────────────────────
app.use(helmet());
// Bug 11 Fix: FRONTEND_URL war unvalidiert — ohne Wert ergab sich `origin: undefined`
// was je nach cors-Version alle Origins erlaubt. Jetzt: expliziter Fallback + Warnung.
const corsOrigin = env.NODE_ENV === 'production'
  ? (process.env.FRONTEND_URL ?? (() => {
      console.warn('[CORS] FRONTEND_URL nicht gesetzt — alle Origins erlaubt. Bitte FRONTEND_URL setzen.');
      return true; // `true` = Origin aus Request spiegeln (erlaubt alle, aber explizit)
    })())
  : '*';

app.use(cors({
  origin:      corsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Statische Uploads ────────────────────────────────────────────────────────
const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');
app.use('/uploads', express.static(UPLOADS_DIR));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:  'ok',
    env:     env.NODE_ENV,
    version: '1.0.0',
    zeit:    new Date().toISOString(),
  });
});

// ─── API-Routen ───────────────────────────────────────────────────────────────
const api = express.Router();

// Upload
api.use('/upload',            uploadRoutes);

// Auth
api.use('/auth',              authRoutes);
api.use('/mitarbeiter-auth',  mitarbeiterAuthRoutes);

// Stammdaten (Admin)
api.use('/mitarbeiter',       mitarbeiterRoutes);
api.use('/projekte',          projekteRoutes);
api.use('/rollen',            rollenRoutes);

// Bonus & Prognose
api.use('/bonus',             bonusRoutes);
api.use('/prognose',          prognoseRoutes);

// Konfiguration & Sync
api.use('/konfiguration',     konfigurationRoutes);
api.use('/sync',              syncRoutes);

// Auszahlungen
api.use('/auszahlungen',      auszahlungenRoutes);

// Admin-spezifisch
api.use('/admin/users',            adminUserRoutes);
api.use('/admin/jahresabschluss',  jahresabschlussRoutes);

app.use('/api', api);

// ─── Frontend Static Files (SPA) ─────────────────────────────────────────────
// Pfad: packages/backend/src/index.ts → ../../frontend/dist (relativ zu dist/index.js)
const FRONTEND_DIST = path.resolve(__dirname, '..', '..', 'frontend', 'dist');

app.use(express.static(FRONTEND_DIST));

// SPA-Fallback: alle nicht-/api-Routen liefern index.html
// (React Router übernimmt das Client-side Routing)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

// ─── 404 + Fehlerbehandlung (nur noch für /api-Routen) ───────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Server starten ───────────────────────────────────────────────────────────
async function seedKonfiguration() {
  const count = await prisma.konfiguration.count();
  if (count === 0) {
    await prisma.konfiguration.createMany({
      data: [
        { key: 'unternehmensname',                   value: 'FriStD-Bau ZuB GmbH & Co.KG', typ: 'string',  beschreibung: 'Unternehmensname für Branding und PDF-Export' },
        { key: 'unternehmens_logo_url',               value: '',                             typ: 'string',  beschreibung: 'URL oder Pfad zum Unternehmenslogo' },
        { key: 'stundensatz_option_b',                value: '30',                           typ: 'number',  beschreibung: '[VERALTET] Wird nicht mehr verwendet — Stufenmodell (stundensatzb_stufe*) hat Vorrang' },
        { key: 'stundensatz_option_a',                value: '10',                           typ: 'number',  beschreibung: 'Vergütung je abgerechneter Zusatzstunde (Option A) in €/h' },
        { key: 'rollenfaktor_min',                    value: '0.9',                          typ: 'number',  beschreibung: 'Mindest-Rollenfaktor — kein Faktor darf darunter liegen' },
        { key: 'kranktage_schwellenwert',             value: '15',                           typ: 'number',  beschreibung: 'Maximale Kranktage pro Jahr für Auszahlungsanspruch' },
        { key: 'mindest_betriebszugehoerigkeit_monate', value: '12',                        typ: 'number',  beschreibung: 'Mindestmonate Betriebszugehörigkeit für Auszahlungsanspruch' },
        { key: 'mindest_auslastung_bonusrelevant',    value: '90',                           typ: 'number',  beschreibung: 'Mindest-Auslastung (%) eines Projekts für Bonusrelevanz (0–100)' },
        { key: 'auszahlungsstichtag',                 value: '12-31',                        typ: 'string',  beschreibung: 'Stichtag für Jahresauszahlung im Format MM-DD' },
        { key: 'halbjahresauszahlung_aktiv',          value: 'false',                        typ: 'boolean', beschreibung: 'Optionale Halbjahres-Auszahlung (nur Option A) aktivieren' },
        { key: 'saldo_berechnungsmethode',            value: 'gesamt',                       typ: 'string',  beschreibung: 'Berechnungsmethode für Option B: gesamt | proportional | abschlussjahr' },
        { key: 'sync_cron_ausdruck',                  value: '0 6 * * *',                    typ: 'string',  beschreibung: 'Cron-Ausdruck für automatischen API-Sync (Standard: tägl. 06:00)' },
        { key: 'api_endpoint_url',                    value: '',                             typ: 'string',  beschreibung: 'URL der externen Zeiterfassungs-API' },
        { key: 'api_key_encrypted',                   value: '',                             typ: 'string',  beschreibung: 'API-Key (verschlüsselt) — nie im Frontend exponieren' },
      ],
      skipDuplicates: true,
    });
    console.log('✅ Standardkonfiguration angelegt');
  }
}

async function seedDefaultAdmin() {
  const count = await prisma.adminUser.count();
  if (count === 0) {
    const adminEmail = process.env.ADMIN_INITIAL_EMAIL ?? 'admin@bonustrack.app';
    const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;

    if (!adminPassword) {
      if (env.NODE_ENV === 'production') {
        console.error('❌ ADMIN_INITIAL_PASSWORD ist nicht gesetzt.');
        console.error('   Setze ADMIN_INITIAL_PASSWORD als Umgebungsvariable, bevor du den Server startest.');
        console.error('   Der Server wird nicht gestartet, um unsichere Standard-Credentials zu vermeiden.');
        await prisma.$disconnect();
        process.exit(1);
      }

      const { randomBytes } = await import('crypto');
      const generatedPassword = randomBytes(16).toString('base64url');
      const hash = await bcrypt.hash(generatedPassword, 12);
      await prisma.adminUser.create({
        data: {
          name:         'Admin',
          email:        adminEmail,
          passwortHash: hash,
          rolle:        'superadmin',
          aktiv:        true,
        },
      });
      console.log('✅ Standard-Admin angelegt (Entwicklungsumgebung)');
      console.log(`   E-Mail:   ${adminEmail}`);
      console.log(`   Passwort: ${generatedPassword}`);
      return;
    }

    const hash = await bcrypt.hash(adminPassword, 12);
    await prisma.adminUser.create({
      data: {
        name:         'Admin',
        email:        adminEmail,
        passwortHash: hash,
        rolle:        'superadmin',
        aktiv:        true,
      },
    });
    console.log('✅ Standard-Admin angelegt');
    console.log(`   E-Mail:   ${adminEmail}`);
    console.log('   Bitte sofort nach dem ersten Login das Passwort ändern!');
  }
}

// Idempotente DB-Migrationen (laufen bei jedem Start, sind aber sicher wiederholbar)
async function runMigrations() {
  // Bug 8: stundensatz_option_b ist durch das Stufenmodell abgelöst — Beschreibung aktualisieren
  await prisma.konfiguration.updateMany({
    where: { key: 'stundensatz_option_b', beschreibung: { not: { startsWith: '[VERALTET]' } } },
    data:  { beschreibung: '[VERALTET] Wird nicht mehr verwendet — Stufenmodell (stundensatzb_stufe*) hat Vorrang' },
  });

  // Neue Konfig: Kalenderjahr-Bedingung (MA muss vom 01.01.–31.12. im Betrieb gewesen sein)
  await prisma.konfiguration.upsert({
    where:  { key: 'ganzjahres_bedingung_aktiv' },
    update: {},
    create: {
      key:          'ganzjahres_bedingung_aktiv',
      value:        'true',
      typ:          'boolean',
      beschreibung: 'Kalenderjahr-Bedingung: MA muss vom 01.01. bis 31.12. im Betrieb gewesen sein',
    },
  });
}

async function bootstrap() {
  try {
    await prisma.$connect();
    console.log('✅ Datenbankverbindung hergestellt');

    await seedKonfiguration();
    await seedDefaultAdmin();
    await runMigrations();

    const { syncJob } = await import('./jobs/sync.job');
    await syncJob.start();
    console.log('✅ Sync-Cron-Job gestartet');

    app.listen(env.PORT, () => {
      console.log(`🚀 BonusTrack Backend läuft auf Port ${env.PORT}`);
      console.log(`   Umgebung: ${env.NODE_ENV}`);
      console.log(`   Health:   http://localhost:${env.PORT}/health`);
      console.log('');
      console.log('   Routen:');
      console.log('   POST /api/auth/login');
      console.log('   POST /api/mitarbeiter-auth/login');
      console.log('   GET  /api/mitarbeiter');
      console.log('   GET  /api/projekte');
      console.log('   GET  /api/rollen');
      console.log('   GET  /api/bonus/uebersicht');
      console.log('   GET  /api/prognose');
      console.log('   GET  /api/konfiguration');
      console.log('   POST /api/sync');
      console.log('   GET  /api/auszahlungen');
      console.log('   GET  /api/admin/jahresabschluss/vorschau');
    });
  } catch (err) {
    console.error('❌ Startfehler:', err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Graceful Shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM empfangen — Server wird beendet...');
  const { syncJob } = await import('./jobs/sync.job');
  syncJob.stop();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  const { syncJob } = await import('./jobs/sync.job');
  syncJob.stop();
  await prisma.$disconnect();
  process.exit(0);
});

bootstrap();
