# BonusTrack

TypeScript-Monorepo für die Verwaltung von Mitarbeiterboni und Projektauszahlungen für FriStD-Bau.

## Tech-Stack
- **Backend**: Node.js + Express + TypeScript + Prisma ORM + PostgreSQL
- **Frontend**: React + Vite + Tailwind CSS
- **Port**: 5000 (Backend dient auch das gebaute Frontend)
- **Workflow**: `npm run dev:backend` (startet Backend + serven des gebauten Frontends)

## Architektur

### Monorepo-Struktur
```
packages/
  backend/   → Express-API, Prisma-Schema, Services
  frontend/  → React/Vite SPA (wird ins Backend-public gebaut)
```

### Partner-API-Sync
- Basis-URL: `https://fristd-bau.replit.app`
- Auth-Header: `X-API-Key: $PARTNER_API_KEY`
- Endpunkte: `/api/partner/employees`, `/api/partner/projects`, `/api/partner/projects/:id/timeentries`
- Cron: täglich 06:00 Uhr
- Nur Zeitbuchungen mit `wageType === "001"` (reguläre Arbeit) werden gezählt
- Mitarbeiterfilter: `employeeNumber.startsWith('7')`

### Jahres-Architektur (wichtig!)
- `ProjektMitarbeiter` speichert Stunden **je Mitarbeiter, je Projekt, je Kalenderjahr** (PK: `projektId + mitarbeiterId + jahr`)
- Die Sync-Funktion gruppiert Zeiteinträge nach dem Jahr aus dem `date`-Feld
- Bonus- und Prognoseberechnungen filtern immer nach `{ jahr: kalenderjahr }`
- Für Vorjahre werden alle Projekte einbezogen (nicht nur aktive)
- Frontend: Jahres-Picker in Dashboard und Prognose (ab 2025)

### Bonus-Berechnung
- **Option A** (Zusatzstunden): `Stunden × Stundensatz_A`; Quelle: **`bonusbuchungen`** (typ='option_a')
- **Option B** (Projekteffizienz): `MAX(0, Jahressaldo) × Stundensatz_B`
- Qualifikation: Eintrittsdatum, Krankheits-Maxgrenze, Mindest-Betriebszugehörigkeit
- `Prisma Decimal`-Felder → immer mit `Number()` casten vor Rechenoperationen

### Krankheits-Staffel + § 4a EFZG (siehe `utils/krankenfaktor.ts`)
- Karenzphase bis `kranktage_karenz` Tage → 100 % Bonus
- Lineare Staffel: `−kranktage_abzug_pro_tag_prozent` pro Tag über Karenz
- Maxgrenze `kranktage_max_grenze` → Disqualifikation (kein Bonus)
- **§ 4a EFZG-Schutz** (zwingend): max. Kürzung pro Tag = `kranktage_efzg_tagesfaktor × stundenlohnBrutto × tagesstundenDurchschnitt`
- App nimmt für den MA den günstigeren Wert aus prozentualer Kürzung und EFZG-Cap
- Ohne `stundenlohnBrutto` greift nur die prozentuale Kürzung (Warn-Log)
- Berechnungsreihenfolge: voller Brutto → prozentuale Kürzung → EFZG-Cap → Disqualifikations-Check
- Konfig-Keys: `kranktage_karenz`, `kranktage_abzug_pro_tag_prozent`, `kranktage_max_grenze`, `kranktage_efzg_schutz_aktiv`, `kranktage_efzg_tagesfaktor`
- Legacy: `kranktage_schwellenwert` ist als Konfig-Eintrag verblieben, aber unbenutzt — siehe `prisma/migrate-kranktage-max-grenze.ts`

### Partner-Extras-Sync (bonusbuchungen)
- `POST /api/partner/extras` liefert Einzelbuchungen mit Datum, Beschreibung, Gewerk
- `partnerExtrasSync.service.ts` speichert je API-Eintrag einen `bonusbuchung`-Datensatz
- `erstelltVonId = null` markiert Auto-Sync-Einträge (werden bei Sync idempotent gelöscht + neu eingefügt)
- `extraStunden` in `projekt_mitarbeiter` wird parallel gepflegt (Rückwärtskompatibilität)
- Jahres-Extras-Sync: `POST /api/sync/extras?jahr=YYYY` — synct Extras für beliebiges Jahr (auch Vorjahre)
- Admin-UI: Dashboard → „Extra-Stunden nachholen" mit Jahres-Dropdown + „Extras-Sync"-Button

### Rollen
- Helfer: Faktor 1.0
- Geselle: Faktor 1.1
- Fachkraft: Faktor 1.3
- Polier: Faktor 1.6

## Bonus-Konfigurationsoptionen (Admin → Konfiguration)

### Saldo-Berechnungsmethode (Option B)
Konfig-Key: `saldo_berechnungsmethode` (string: `gesamt` | `proportional` | `abschlussjahr`)
- **gesamt**: Gesamter Projektsaldo über alle Jahre (Standard)
- **proportional**: Anteiliger Jahressaldo = `gesamtSaldo × (jahresIst / gesamtIst)`
- **abschlussjahr**: Nur abgeschlossene Projekte gehen in den Saldo ein

### Projektfilter (Bonus-Ausschluss)
Feld: `Projekt.bonusAusgeschlossen Boolean @default(false)`
- Admin verwaltet in Konfiguration → **Projektfilter**: Alle Projekte als Checkbox-Liste
- Angehaktes Projekt wird (a) aus Projektübersicht ausgeblendet und (b) aus Bonus-Berechnung ausgeschlossen
- Endpunkt: `PATCH /api/projekte/:id/bonus-ausschluss` (Toggle)
- Kp-Sonderbehandlung (`/^kp[-\s]/i`) vollständig entfernt — Kp-Projekte laufen wie normale Projekte

### Ganzjahres-Bedingung mit Austritts-Toleranz
Konfig-Key: `ganzjahres_bedingung_mindest_monate_im_jahr` (number, Default `0` = deaktiviert)
- Greift nur wenn `ganzjahres_bedingung_aktiv === true`
- > 0: MA mit Austritt im Bonusjahr und ≥ X Monaten im Jahr bleiben qualifiziert
- Beispiel: Wert 6 → Franz (Austritt 18.07., 7 Monate im Jahr) wird qualifiziert

### Halbjahres-Auszahlung (Option A Vorschuss)
Konfig-Key: `halbjahresauszahlung_aktiv` (boolean: `true`/`false`)
- Wenn aktiviert: Zeigt H1-Karte auf der Jahresabschluss-Seite
- H1-Betrag wird in `Auszahlung.h1BetragOptionA` + `h1AusgezahltAm` gespeichert
- Jahresabschluss zieht H1 automatisch von `betragOptionA` ab
- Route: `POST /api/admin/jahresabschluss/halbjahr`

## Wichtige Regeln
- Backend-Routen: spezifische Routen (z.B. `/sync`, `/:id/deaktivieren`) VOR `/:id`
- Frontend nach Änderungen neu bauen: `cd packages/frontend && npm run build`
- Default-Admin: `admin@bonustrack.app` / `BonusTrack2024!`
- Prisma-Schema nach Änderungen pushen: `cd packages/backend && npx prisma db push`

## Umgebungsvariablen
- `DATABASE_URL` — PostgreSQL-Connection-String
- `JWT_SECRET` — JWT-Signing-Key
- `PARTNER_API_KEY` — FriStD-Bau Partner-API-Key
- `PORT=5000`, `NODE_ENV=development`, `JWT_EXPIRES_IN=8h`
