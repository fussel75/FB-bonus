/**
 * Migration: kranktage_schwellenwert → kranktage_max_grenze
 *
 * Hintergrund:
 * Früher war `kranktage_schwellenwert` der harte Cut: bei Überschreiten verlor
 * der MA den gesamten Bonus. Mit der neuen Krankheits-Staffel kürzt der Wert nur
 * noch oberhalb der Karenzgrenze prozentual; der harte Cut ist jetzt
 * `kranktage_max_grenze` mit Default 40.
 *
 * Diese Migration übernimmt den alten Schwellenwert als neue Maxgrenze, sofern
 * er > 15 ist (sonst hätte der Admin einen unrealistisch niedrigen Cut gesetzt).
 * Andernfalls bleibt der Seed-Default von 40 stehen.
 *
 * Ausführen:
 *   cd packages/backend && npx ts-node prisma/migrate-kranktage-max-grenze.ts
 */

import { PrismaClient, KonfigTyp } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Migration: kranktage_schwellenwert → kranktage_max_grenze');

  const alt = await prisma.konfiguration.findUnique({
    where: { key: 'kranktage_schwellenwert' },
  });

  if (!alt) {
    console.log('  ✓ Kein alter Schwellenwert vorhanden — übersprungen');
    return;
  }

  const altWert = Number(alt.value);
  const neuerWert = altWert > 15 ? String(altWert) : '40';

  await prisma.konfiguration.upsert({
    where: { key: 'kranktage_max_grenze' },
    update: { value: neuerWert },
    create: {
      key: 'kranktage_max_grenze',
      value: neuerWert,
      typ: KonfigTyp.number,
      beschreibung: 'Obergrenze Krankheitstage — darüber kein Bonus mehr (Disqualifikation)',
      geaendertVon: 'System (Migration)',
    },
  });

  console.log(`  ✓ kranktage_max_grenze gesetzt auf ${neuerWert} (alt: ${altWert})`);
}

main()
  .catch((e) => {
    console.error('❌ Migrations-Fehler:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
