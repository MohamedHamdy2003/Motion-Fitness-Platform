# Motion API — F00–F02

NestJS, TypeScript, PostgreSQL and TypeORM. JWT Bearer authentication. Contract version `v1 / 0.3.0`. No Swagger/OpenAPI.

[شرح مبسط بالعربي لحالة المشروع والشغل المنفّذ](docs/PROJECT_PROGRESS_AR.md).

[دليل إنشاء الحسابات وربط الاستضافة وDNS وGoogle وApple بالمشروع](docs/ACCOUNTS_SETUP_AR.md).

The latest [backend plan](docs/Motion_Backend_Plan.md) (v2.15, updated 2026-10-31) is available in `docs/` as an exact copy of the authoritative [root plan](Motion_Backend_Plan.md); keep both copies in sync when updating the plan. The plan and [research notes](docs/Motion_Research_and_Content_Sourcing.md) remain authoritative. Implementation and external integration status are tracked separately in [delivery status](docs/DELIVERY_STATUS.md).

## Local setup

Requires Node 24, npm and Docker Desktop running Linux containers.

```powershell
npm ci
node scripts/setup-local.cjs
docker compose up -d postgres
npm run migration:run
npm run seed:lookups
npm run dev
```

Base URL: `http://localhost:3100/api/v1`. PostgreSQL binds to `127.0.0.1:55432` and persists in the `motion_motion_pg` Docker volume. API port 3100 avoids an existing app on this workstation. Never use the Compose credentials in staging.

`setup-local` creates an ignored `.env` with random keys and **local encrypted mail capture**. It preserves an existing `.env`. Registration queues a captured message; it does not send real email. Read the latest local message for your test account:

```powershell
npx tsx scripts/read-mail.ts athlete@example.test
```

This command prints a private verification/reset link only to your local terminal. Never paste it into source control. `MAIL_MODE=disabled` returns `503 EMAIL_NOT_CONFIGURED` for delivery-dependent operations. Gmail SMTP and HTTPS Resend adapters are included; live delivery remains unverified until configured.

Approved policy (2026-10-31): users must be strictly older than 18, checked using their birth date and timezone; with date-only birth data, eligibility starts the day after the 18th birthday. The profile holds one current weight, edited by the user without a measurement date or history. `MINIMUM_AGE` and `MEASUREMENT_MAX_AGE_DAYS` are no longer configuration settings. Weight and height are profile fields; historical tracking is deferred. See [latest decisions](docs/PRODUCT_DECISIONS_AR.md).

## Verification

Create a dedicated disposable database, then run:

```powershell
docker compose exec -T postgres createdb -U motion motion_test
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:integration
npm run bruno
```

The `createdb` command is needed once. Integration tests default to port 55432 and database `motion_test`. Override `TEST_DATABASE_URL` for CI. Tests refuse database names without the `_test` suffix and **revert/reapply migrations and truncate fixture data** there. They never target the development `motion` database. Bruno requires the local API running and mail capture configured; it creates disposable `example.test` users.

```powershell
npm --prefix ai-service ci
npm --prefix ai-service run typecheck
npm --prefix ai-service test
npm --prefix ai-service run build
```

AI tests use fixtures and make no paid model calls. Main CI checks both services, an empty PostgreSQL database, migrations, seed reruns, security/concurrency E2E tests and Bruno.

## Mobile integration

Open `bruno/` in Bruno. `reference/` has every API operation, including configuration-blocked operations. `smoke/` is the automated local flow. Copy environment variables into a local-only environment; never commit tokens. Staging is intentionally an `.invalid` hostname until an actual deployment exists.

Reference requests are grouped into `Auth`, `Profile`, `Settings`, `Food Preferences`, `Injuries`, `References`, `Matching`, `Media`, `Account`, and `Health` folders. The `smoke/` requests retain their numbered order because later steps depend on earlier responses. `scripts/generate-bruno.cjs` preserves this layout when regenerating the collection.

Read [API contracts and examples](docs/API_CONTRACT.md), [provider integration](docs/PROVIDER_INTEGRATION.md), and [free staging preparation](docs/STAGING.md). No client-developer messages have been sent.

## Database and jobs

The application and CLI share one DataSource configuration. `synchronize` and `migrationsRun` are always false. Deployments explicitly run `dist/infrastructure/database/migrate.js`, which takes a database advisory lock, applies migrations and seeds lookups before starting the server. Reverting is a deliberate maintenance operation: stop writes, back up, run `npm run migration:revert`; the initial down migration removes all slice tables.

`seed:lookups` is transactional/idempotent. `seed:content` checks lookup dependencies and clearly reports no approved content dataset supplied. No scientific foods, programs, meals or demo users are invented.

PostgreSQL mail/deletion jobs run from the API process, using `SKIP LOCKED`, leases and fencing tokens. A separate `npm run worker` process is available on infrastructure that supports it. Sleeping free web services delay background work until they wake; the outbox survives in PostgreSQL. SMTP may redeliver after a crash; email links remain single-use. Failed jobs retain error codes only and retry with bounded backoff. Cleanup runs hourly while the process is awake.

Deletion immediately blocks the account and revokes sessions. Actual data/file cleanup waits for approved retention policy. Apple revocation retries five times before data deletion can proceed with an explicit provider-warning status. Store-subscription cancellation belongs to F11/F14.
