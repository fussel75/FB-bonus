# Threat Model

## Project Overview

BonusTrack is a TypeScript monorepo for managing employee bonuses and project payouts. The production system is an Express API backed by PostgreSQL/Prisma and a React SPA served by the backend. Primary users are administrators who manage employees, projects, payouts, configuration, and sync jobs, plus employees who log in to view only their own bonus and forecast data.

Production assumptions for this scan: only production-reachable code is in scope; `NODE_ENV` is `production`; Replit terminates TLS for deployed traffic; mock or sandbox-only code is out of scope unless separately exposed.

## Assets

- **Admin accounts and JWTs** — compromise grants full access to payroll-like bonus data, payout workflows, sync controls, and configuration.
- **Employee accounts and JWTs** — compromise exposes personal profile and compensation-related information and may provide a foothold into privileged routes if role boundaries fail.
- **Bonus, payout, and project records** — financial/business data whose unauthorized disclosure or tampering affects compensation and reporting.
- **Employee personal data** — names, emails, sickness-day counts, employment dates, payout preferences, and project assignment history.
- **Application secrets** — `JWT_SECRET`, `DATABASE_URL`, `PARTNER_API_KEY`, and any outbound mail/API credentials.
- **Configuration and audit logs** — operational settings, sync schedules, payout rules, and change history that influence financial calculations.
- **Uploaded branding files** — content stored under `/uploads` and later rendered or downloaded by users.

## Trust Boundaries

- **Browser to Express API** — all client input is untrusted; server-side authn/authz must be authoritative.
- **Admin versus employee boundary** — admin routes and employee self-service routes use different JWT shapes and must not be interchangeable.
- **Express API to PostgreSQL** — application code has broad read/write access to sensitive records.
- **Express API to partner service** — scheduled and manual sync jobs call an external partner API using `X-API-Key` credentials.
- **Authenticated API to static file serving** — uploaded files are written by authenticated users but later served publicly from `/uploads`.
- **Production versus dev/build artifacts** — `dist/`, local tooling, and development-only behavior should be ignored unless production routing makes them reachable.

## Scan Anchors

- **Production entry points:** `packages/backend/src/index.ts`, backend route files under `packages/backend/src/routes/**`, auth middleware under `packages/backend/src/middleware/**`.
- **Highest-risk areas:** auth bootstrapping and JWT verification, admin/employee route separation, payout/bonus/config routes, sync services, exports, and uploads.
- **Public surfaces:** `/health`, `/api/auth/login`, `/api/mitarbeiter-auth/login`, static frontend files, and publicly served `/uploads/*` files.
- **Authenticated/admin surfaces:** most `/api/**` routes guarded by `requireAuth`; employee self-service routes under `/api/mitarbeiter-auth/me*` guarded by `requireMitarbeiterAuth`; superadmin-only actions add `requireSuperAdmin`.
- **Usually dev-only/low-priority:** `packages/*/dist`, build metadata, and local seed/dev workflow details unless bootstrapping code also runs in production.

## Threat Categories

### Spoofing

The application relies on bearer JWTs for both admins and employees. The system must verify token signatures, expiry, and intended principal type on every protected route. Bootstrap credentials and seeded accounts must never create predictable production access.

### Tampering

Admins can modify projects, bonus configuration, employee records, and payout states. The server must enforce role-based permissions for every mutation and must never trust client-side route separation. Sync inputs from the partner API must be treated as untrusted external data.

### Information Disclosure

The API stores and serves employee and compensation data. Employee users must only access their own records, while admin-only datasets must remain inaccessible to employee tokens. Sensitive configuration values and secrets must not be exposed in API responses, logs, exports, or static files.

### Denial of Service

Login, sync, export, and upload endpoints can perform expensive work. Production endpoints should resist brute force and abuse with bounded request sizes, execution limits, and appropriate authorization before costly operations run.

### Elevation of Privilege

The most important project-specific risk is broken separation between employee and admin capabilities. All admin endpoints must require an actual admin principal, not just any JWT signed with the shared secret. Superadmin-only actions must remain restricted even if a lower-privilege account is compromised.
