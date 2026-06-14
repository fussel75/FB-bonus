/**
 * update-stammdaten-2026.ts
 *
 * One-Off-Skript für die Stammdaten-Aktualisierung zum Bonusjahr 2026.
 *
 * Hintergrund: Mitarbeiter kommen normalerweise per Partner-API-Sync ins
 * System. Dieses Skript ergänzt nur die Felder, die in der Partner-API nicht
 * gepflegt werden — Stundenlohn, Tagesstunden, Austrittsdatum.
 *
 * Ausführen:
 *   cd packages/backend && npx ts-node ../../scripts/update-stammdaten-2026.ts
 *
 * Idempotent: kann beliebig oft ausgeführt werden.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Update {
  // Suchen primär per personalNummer/externeId (falls bekannt), sonst per
  // Vor+Nachname-Match. Hier reicht der Name, weil die Stammdaten klein sind.
  vorname:                   string;
  nachname:                  string;
  rolleBezeichnung?:         string;
  stundenlohnBrutto?:        number | null;
  tagesstundenDurchschnitt?: number | null;
  austrittsdatum?:           string | null; // YYYY-MM-DD
  aktiv?:                    boolean;
}

const UPDATES: Update[] = [
  {
    vorname: 'Phillip',
    nachname: 'Springer',
    rolleBezeichnung: 'Polier',
    stundenlohnBrutto: 25.00,
    tagesstundenDurchschnitt: 8.00,
  },
  {
    vorname: 'Olaf',
    nachname: 'Garbers',
    rolleBezeichnung: 'Polier',
    stundenlohnBrutto: 25.00,
    tagesstundenDurchschnitt: 8.00,
  },
  {
    vorname: 'Dritan',
    nachname: '',
    rolleBezeichnung: 'Fachkraft',
    stundenlohnBrutto: 22.00,
    tagesstundenDurchschnitt: 8.00,
  },
  {
    vorname: 'Franz',
    nachname: 'Scharnweber',
    rolleBezeichnung: 'Geselle',
    stundenlohnBrutto: 22.00,
    tagesstundenDurchschnitt: 8.00,
    austrittsdatum: '2026-07-18',
  },
  {
    // Lukas: nur Austrittsdatum vermerken, sonst keine Änderung
    vorname: 'Lukas',
    nachname: 'Szameit',
    austrittsdatum: '2026-06-30',
  },
  {
    // Mark-Leon: bereits ausgetreten — sicherstellen, dass aktiv=false
    vorname: 'Mark-Leon',
    nachname: 'Greve',
    aktiv: false,
  },
];

async function findeMitarbeiter(vorname: string, nachname: string) {
  const trimmedNach = nachname.trim();
  if (trimmedNach === '') {
    // Mitarbeiter wie "Dritan" haben evtl. keinen Nachnamen
    return prisma.mitarbeiter.findFirst({
      where: { vorname: { equals: vorname, mode: 'insensitive' } },
    });
  }
  return prisma.mitarbeiter.findFirst({
    where: {
      vorname:  { equals: vorname,    mode: 'insensitive' },
      nachname: { equals: trimmedNach, mode: 'insensitive' },
    },
  });
}

async function main() {
  console.log('🔧 Stammdaten-Update Bonusjahr 2026');

  let erfolgreich = 0;
  let nichtGefunden = 0;

  for (const u of UPDATES) {
    const name = `${u.vorname} ${u.nachname}`.trim();
    const ma = await findeMitarbeiter(u.vorname, u.nachname);

    if (!ma) {
      console.warn(`  ⚠️  ${name} nicht gefunden — übersprungen`);
      nichtGefunden++;
      continue;
    }

    const data: Record<string, unknown> = {};

    if (u.rolleBezeichnung) {
      const rolle = await prisma.rolle.findUnique({ where: { bezeichnung: u.rolleBezeichnung } });
      if (!rolle) {
        console.warn(`  ⚠️  Rolle "${u.rolleBezeichnung}" für ${name} nicht gefunden — Rolle bleibt`);
      } else if (ma.rolleId !== rolle.id) {
        data.rolleId = rolle.id;
      }
    }

    if (u.stundenlohnBrutto !== undefined) data.stundenlohnBrutto        = u.stundenlohnBrutto;
    if (u.tagesstundenDurchschnitt !== undefined) data.tagesstundenDurchschnitt = u.tagesstundenDurchschnitt;
    if (u.austrittsdatum !== undefined)    data.austrittsdatum           = u.austrittsdatum ? new Date(u.austrittsdatum) : null;
    if (u.aktiv !== undefined)             data.aktiv                    = u.aktiv;

    if (Object.keys(data).length === 0) {
      console.log(`  ◌ ${name} — keine Änderungen nötig`);
      continue;
    }

    await prisma.mitarbeiter.update({
      where: { id: ma.id },
      data,
    });
    console.log(`  ✓ ${name} aktualisiert: ${Object.keys(data).join(', ')}`);
    erfolgreich++;
  }

  console.log(`\n✅ Fertig: ${erfolgreich} aktualisiert, ${nichtGefunden} nicht gefunden`);
}

main()
  .catch((e) => {
    console.error('❌ Fehler:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
