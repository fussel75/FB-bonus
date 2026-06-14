import { PrismaClient, KonfigTyp, AdminRolle } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Datenbank...');

  // ─── Standard-Rollen ────────────────────────────────────────────────────────
  const rollen = [
    { bezeichnung: 'Helfer',    faktor: 1.0 },
    { bezeichnung: 'Geselle',   faktor: 1.1 },
    { bezeichnung: 'Fachkraft', faktor: 1.3 },
    { bezeichnung: 'Polier',    faktor: 1.6 },
  ];

  for (const rolle of rollen) {
    await prisma.rolle.upsert({
      where:  { bezeichnung: rolle.bezeichnung },
      // upsert ohne update — bestehende Faktoren werden NICHT überschrieben.
      // Neue Rollen werden mit create angelegt.
      update: {},
      create: rolle,
    });
  }
  console.log('  ✓ Rollen angelegt');

  // ─── Konfigurationsparameter ─────────────────────────────────────────────────
  const config: Array<{
    key: string;
    value: string;
    typ: KonfigTyp;
    beschreibung: string;
  }> = [
    {
      key: 'stundensatz_option_b',
      value: '25.00',
      typ: KonfigTyp.number,
      beschreibung: 'Auszahlungssatz für Guthabenstunden (Option B) in €/h',
    },
    {
      key: 'stundensatz_option_a',
      value: '5.00',
      typ: KonfigTyp.number,
      beschreibung: 'Vergütung je abgerechneter Zusatzstunde (Option A) in €/h',
    },
    {
      key: 'kranktage_schwellenwert',
      value: '15',
      typ: KonfigTyp.number,
      beschreibung: 'Veraltet: vormals Komplett-Cut. Wird nicht mehr verwendet (siehe kranktage_max_grenze)',
    },
    {
      key: 'kranktage_karenz',
      value: '15',
      typ: KonfigTyp.number,
      beschreibung: 'Bis einschl. dieser Tagesanzahl wird der Bonus zu 100 % ausgezahlt',
    },
    {
      key: 'kranktage_abzug_pro_tag_prozent',
      value: '4',
      typ: KonfigTyp.number,
      beschreibung: 'Prozentuale Bonus-Kürzung pro Krankheitstag über der Karenzgrenze',
    },
    {
      key: 'kranktage_max_grenze',
      value: '40',
      typ: KonfigTyp.number,
      beschreibung: 'Obergrenze Krankheitstage — darüber kein Bonus mehr (Disqualifikation)',
    },
    {
      key: 'kranktage_efzg_schutz_aktiv',
      value: 'true',
      typ: KonfigTyp.boolean,
      beschreibung: '§ 4a EFZG-Schutz: max. Kürzung pro Tag = Tagesfaktor × Tageslohn',
    },
    {
      key: 'kranktage_efzg_tagesfaktor',
      value: '0.25',
      typ: KonfigTyp.number,
      beschreibung: 'Anteil eines Tageslohns als max. Kürzung je Krankheitstag (gesetzlich 0.25)',
    },
    {
      key: 'ganzjahres_bedingung_mindest_monate_im_jahr',
      value: '0',
      typ: KonfigTyp.number,
      beschreibung: 'Mindestmonate im Bonusjahr für anteilige Qualifikation bei Austritt (0 = deaktiviert)',
    },
    {
      key: 'mindest_betriebszugehoerigkeit_monate',
      value: '12',
      typ: KonfigTyp.number,
      beschreibung: 'Mindestmonate Betriebszugehörigkeit für Auszahlungsanspruch',
    },
    {
      key: 'auszahlungsstichtag',
      value: '12-31',
      typ: KonfigTyp.string,
      beschreibung: 'Stichtag für Jahresauszahlung im Format MM-DD',
    },
    {
      key: 'unternehmensname',
      value: 'Mein Bauunternehmen GmbH',
      typ: KonfigTyp.string,
      beschreibung: 'Unternehmensname für Branding und PDF-Export',
    },
    {
      key: 'unternehmens_logo_url',
      value: '',
      typ: KonfigTyp.string,
      beschreibung: 'URL oder Pfad zum Unternehmenslogo',
    },
    {
      key: 'api_endpoint_url',
      value: '',
      typ: KonfigTyp.string,
      beschreibung: 'URL der externen Zeiterfassungs-API',
    },
    {
      key: 'api_key_encrypted',
      value: '',
      typ: KonfigTyp.string,
      beschreibung: 'API-Key (verschlüsselt) — nie im Frontend exponieren',
    },
    {
      key: 'sync_cron_ausdruck',
      value: '0 6 * * *',
      typ: KonfigTyp.string,
      beschreibung: 'Cron-Ausdruck für automatischen API-Sync (Standard: tägl. 06:00)',
    },
    {
      key: 'rollenfaktor_min',
      value: '1.0',
      typ: KonfigTyp.number,
      beschreibung: 'Mindest-Rollenfaktor — kein Faktor darf darunter liegen',
    },
  ];

  for (const entry of config) {
    await prisma.konfiguration.upsert({
      where:  { key: entry.key },
      update: {},            // Beim Re-Seeden bestehende Werte NICHT überschreiben
      create: {
        key:          entry.key,
        value:        entry.value,
        typ:          entry.typ,
        beschreibung: entry.beschreibung,
        geaendertVon: 'System (Seed)',
      },
    });
  }
  console.log('  ✓ Konfiguration angelegt');

  // ─── Standard-Superadmin ─────────────────────────────────────────────────────
  // Passwort beim ersten Start immer ändern!
  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email: 'admin@bonustrack.app' },
  });

  if (!existingAdmin) {
    const hash = await bcrypt.hash('BonusTrack2024!', 12);
    await prisma.adminUser.create({
      data: {
        name:         'Administrator',
        email:        'admin@bonustrack.app',
        rolle:        AdminRolle.superadmin,
        passwortHash: hash,
        aktiv:        true,
      },
    });
    console.log('  ✓ Superadmin angelegt (E-Mail: admin@bonustrack.app)');
    console.log('  ⚠️  Bitte Passwort sofort im Admin-Bereich ändern!');
  } else {
    console.log('  ✓ Superadmin bereits vorhanden — übersprungen');
  }

  console.log('✅ Seed abgeschlossen');
}

main()
  .catch((e) => {
    console.error('❌ Seed-Fehler:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
