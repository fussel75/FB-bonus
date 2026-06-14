import { KonfigTyp } from '@prisma/client';
import { prisma } from '../db/client';

// ─── Typisierte Konfigurationswerte ─────────────────────────────────────────

type KonfigValue = string | number | boolean;

function parseWert(value: string, typ: KonfigTyp): KonfigValue {
  switch (typ) {
    case KonfigTyp.number:  return parseFloat(value);
    case KonfigTyp.boolean: return value === 'true';
    case KonfigTyp.date:
    case KonfigTyp.string:
    default:                return value;
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const konfigService = {
  // Einzelnen Rohwert (string) holen
  async getWert(key: string): Promise<string | null> {
    const entry = await prisma.konfiguration.findUnique({ where: { key } });
    return entry?.value ?? null;
  },

  // Einzelnen Wert mit Typisierung holen
  async getTypisiert(key: string): Promise<KonfigValue | null> {
    const entry = await prisma.konfiguration.findUnique({ where: { key } });
    if (!entry) return null;
    return parseWert(entry.value, entry.typ);
  },

  // Alle Werte als typisiertes Objekt
  async alleWerte(): Promise<Record<string, KonfigValue>> {
    const entries = await prisma.konfiguration.findMany();
    return Object.fromEntries(
      entries.map((e) => [e.key, parseWert(e.value, e.typ)]),
    );
  },

  // Wert setzen + im Änderungslog protokollieren
  async setzeWert(
    key: string,
    value: string,
    geaendertVon: string,
    adminId?: number,
  ) {
    const aktuell = await prisma.konfiguration.findUnique({ where: { key } });
    if (!aktuell) {
      throw new Error(`Konfigurationsschlüssel nicht gefunden: ${key}`);
    }

    const SENSITIVE_KEYS = ['api_key_encrypted'];
    const isSensitive = SENSITIVE_KEYS.includes(key);

    const [updated] = await prisma.$transaction([
      prisma.konfiguration.update({
        where: { key },
        data:  { value, geaendertVon },
      }),
      prisma.konfigLog.create({
        data: {
          konfigKey:   key,
          alterWert:   isSensitive ? '[REDACTED]' : aktuell.value,
          neuerWert:   isSensitive ? '[REDACTED]' : value,
          geaendertVon: adminId,
        },
      }),
    ]);

    return updated;
  },

  // Änderungsprotokoll
  async aenderungslog() {
    return prisma.konfigLog.findMany({
      include: { adminUser: { select: { id: true, name: true, email: true } } },
      orderBy: { geaendertAm: 'desc' },
      take: 100,
    });
  },
};
