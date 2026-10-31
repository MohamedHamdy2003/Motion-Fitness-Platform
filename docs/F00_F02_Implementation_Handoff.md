# Motion — F00–F02 Implementation Handoff

Updated: 2026-10-30. User authorized a separate implementation chat in the same Motion project. This planning chat remains open for later features.

## Source of Truth

- Project: C:/Users/Mohamed Hamada/OneDrive/Desktop/Motion
- Read Motion_Backend_Plan.md (v2.13 or newer) and docs/Motion_Research_and_Content_Sourcing.md before implementation. These are authoritative saved requirements, not a claim that code already exists.
- At handoff, the project has planning/research documents, no backend implementation and no Git repository. Inspect actual files before scaffolding because this may change.
- User communicates in Egyptian Arabic. Code/contracts/docs use English except existing Arabic explanatory paragraphs. No Swagger or OpenAPI tooling.

## Immediate Authorized Delivery

Implement F00, F01 and F02 APIs so Android/iOS client developers can integrate while broader planning continues. Create a versioned Bruno collection with usable examples, assertions, local/staging environment templates and no committed secrets. Deploy a working integration/staging API and PostgreSQL using a currently verified free hosting option. The user authorized free deployment; do not purchase a paid plan. Verify free-tier persistence, quotas, sleep/cold-start behavior, expiry and outbound-email limitations against official current documentation. Do not promise permanent free availability. Prefer an authenticated stable HTTPS API over a temporary local tunnel. Report live base URL and actual endpoint/test status when available.

F00: NestJS + TypeScript + PostgreSQL + TypeORM, shared DataSource, explicit migrations, synchronize:false, migrationsRun:false, configuration validation, validation/error conventions, request IDs, health/readiness, local development setup, jobs/mail infrastructure needed for auth, CI and seed runner. Branches main/dev plus feature branches; feature PRs to dev and tested release PR to main. Green GitHub Actions, meaningful commits, PRs explaining changes. Set up the local repository; use actual available GitHub account/repository information rather than inventing a remote. Keep secrets outside Git.

F01: signed short-lived JWT access tokens in Authorization: Bearer, session/account guard checks, hashed rotating refresh tokens and replay revocation; email/password register/login; email verification/resend; Google/Apple token verification; secure explicit account linking and fresh reauthentication; forgot/reset password by email; change password; logout/logout-all; account deletion/session revocation and cleanup jobs. Read full F01 requirements and routes from the plan. No fake success for unconfigured providers/email delivery. Build and test provider adapters independently, then integrate actual credentials. Do not delay all implementation while waiting for credentials. Subscription-provider integration belongs to later F11/F14; do not pretend deletion cancels store subscriptions.

F02: onboarding/profile/settings, primary_goal FAT_LOSS or STRENGTH_HYPERTROPHY, fitness_level BEGINNER/INTERMEDIATE/ADVANCED, training days 2/3/4/5, height_cm, date_of_birth, initial weight_kg and measurement history, timezone/locale and avatar contract, structured food allergies/dislikes/exclusions, separate injury records and revision/concurrency handling. GET /me aggregates related records; do not embed injuries/allergies into the profile table. Add/list/edit/remove injuries with body area, optional side and final user-confirmed description. Keep the minimal media and reference-list routes needed by the mobile forms in scope. Update 2026-10-31: age is strictly greater than 18 and weight observations have no expiry; users update them manually.

## Dependencies and Honest Delivery Boundaries

The plan places F16 rewrite integration before completing injury entry in F02. Include only the minimal private AiRewriter integration needed for the injury preview flow, or explicitly identify it as pending external provider configuration. User presses Rewrite with AI, previews/edits, then confirms save. Persist only the final accepted text; no original draft, unconfirmed output, raw request bodies or injury text in logs/traces/audit. Preview failure must not save. Never return the input unchanged while claiming AI rewrote it. AI provider selection/credentials and retention need explicit resolution; user has not authorized paid purchases.

Matching, workout fitting, billing and complete program/meal implementation are later features. Keep their interfaces/domain events compatible without implementing the entire platform or presenting mocked functionality as real. Onboarding should expose an honest NOT_STARTED/PENDING matching state until F05 exists. Build F02 preference/reference schemas needed now; defer complete nutrition/catalog functionality.

Ask concise async questions for indispensable external setup (GitHub destination, hosting account, email/deep-link settings, Google/Apple and rewrite provider credentials) while continuing independent local work. Never request secrets in committed files or expose them in logs. Use secure configuration paths. Test meaningful auth/security, ownership, revision, database and Bruno integration behavior on PostgreSQL. A missing external credential is an integration blocker, not a reason to omit implementable endpoints or stop all work.

## Preserve Later Product Decisions

- Admin builds a program and its paired nutrition schedule in one transaction. Day counts match, including rest days. Meals/foods are reusable library content. Each user sees one AI-selected program; there is no user program catalog.
- Matching: SQL AND filter on exact training days/primary goal and supported fitness level; AiAssistedMatcher chooses one supplied candidate using descriptions, approved hints and user measurements. No model training on raw program rows.
- Retain three independent components in private Mastra: AiAssistedMatcher, AiProgramFitter and AiRewriter. No Mastra Workflow and no direct AI database credentials. NestJS validates/persists typed outputs.
- Fitter is exercise-only, on demand for a requested day with active injuries; no injury/rest day means no Fitter call. Current-version assessments and per-user restrictions; no replacement exercises. All-BLOCKED due days can be EXEMPT without fake workout completion; uncertainty never auto-clears.
- Food flags are deterministic queries using structured allergies/ingredients. Flag only the item, not the whole meal. User-confirmed same-section item/meal swaps use admin portions, no nutrition AI. Preserve history.
- Nutrition advances by calendar date independently of delayed workout completion. Equal template lengths do not resolve what to serve after the final nutrition day; that edge case and replacement-program activation timing remain open. Do not resolve these silently while implementing auth/profile.
- No gender-based carb reduction. Sourced meal/program content is future work; portion personalization remains open.
- Two seed entry points: seed-lookups.ts then seed-content.ts; demo users/scenarios separate. Implement infrastructure and required lookups now. Do not invent scientific meal/program data to fill the future content stage. Each stage is transactional/idempotent and content requires its lookup dependencies.

## Client Delivery Artifacts

Bruno requests for all implemented F00–F02 routes, local/staging templates, token acquisition/refresh examples, request/response/error contracts, provider/deep-link integration notes, required reference endpoints, migrations/seeding instructions, test evidence and a feature readiness matrix separating implemented/tested/live from externally blocked. API contract changes should be versioned and clearly communicated in the implementation chat. Do not send messages to client developers unless separately authorized.
