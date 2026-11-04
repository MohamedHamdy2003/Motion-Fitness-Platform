# Motion — F00–F02 Implementation Handoff

Updated: 2026-11-04. Archived handoff: F00–F02 implementation and deployment have since been completed. Use this document only as a historical description of the original implementation requirements.

## Source of Truth

- Project: C:/Users/Mohamed Hamada/OneDrive/Desktop/Motion
- Read Motion_Backend_Plan.md (v2.13 or newer) and docs/Motion_Research_and_Content_Sourcing.md before implementation. These are authoritative saved requirements, not a claim that code already exists.
- The original handoff preceded backend implementation; the repository and current status documents are now authoritative for what exists.
- User communicates in Egyptian Arabic. Code/contracts/docs use English except existing Arabic explanatory paragraphs. No Swagger or OpenAPI tooling.

## Immediate Authorized Delivery

The current production base URL and EC2/RDS/S3 workflow are documented in [AWS deployment](AWS_DEPLOYMENT_AR.md) and [GitHub automation](GITHUB_AUTOMATION_AR.md); a separate staging environment is not provisioned.

The implementation scope below remains useful as a record of the F00–F02 requirements. It is not a current deployment runbook.

F00: NestJS + TypeScript + PostgreSQL + TypeORM, shared DataSource, explicit migrations, synchronize:false, migrationsRun:false, configuration validation, validation/error conventions, request IDs, health/readiness, local development setup, jobs/mail infrastructure needed for auth, CI and seed runner. Branches main/dev plus feature branches; feature PRs to dev and tested release PR to main. Green GitHub Actions, meaningful commits, PRs explaining changes. Set up the local repository; use actual available GitHub account/repository information rather than inventing a remote. Keep secrets outside Git.

F01: signed short-lived JWT access tokens in Authorization: Bearer, session/account guard checks, hashed rotating refresh tokens and replay revocation; email/password register/login; email verification/resend; Google/Apple token verification; secure explicit account linking and fresh reauthentication; forgot/reset password by email; change password; logout/logout-all; account deletion/session revocation and cleanup jobs. Read full F01 requirements and routes from the plan. No fake success for unconfigured providers/email delivery. Build and test provider adapters independently, then integrate actual credentials. Do not delay all implementation while waiting for credentials. Subscription-provider integration belongs to later F11/F14; do not pretend deletion cancels store subscriptions.

F02: onboarding/profile/settings, primary_goal FAT_LOSS or STRENGTH_HYPERTROPHY, self-reported gender (MALE/FEMALE from the seeded lookup), fitness_level enum BEGINNER/INTERMEDIATE/ADVANCED, 2-5 selected training weekdays (count derived from the selected days), height_cm, date_of_birth, current weight_kg directly in the profile, timezone/locale and avatar contract, structured food allergies/dislikes/exclusions, separate injury records and revision/concurrency handling. GET /me aggregates related records; do not embed injuries/allergies into the profile table. Add/list/edit/remove injuries with body area, optional side and final user-confirmed description. Keep the minimal media and reference-list routes needed by the mobile forms in scope. Update 2026-11-04: age is strictly greater than 18 and current weight has no measurement date/history; users edit it manually. Gender is not used to infer calories or medical status.

## Dependencies and Honest Delivery Boundaries

The plan places F16 rewrite integration before completing injury entry in F02. Include only the minimal private AiRewriter integration needed for the injury preview flow, or explicitly identify it as pending external provider configuration. User presses Rewrite with AI, previews/edits, then confirms save. Persist only the final accepted text; no original draft, unconfirmed output, raw request bodies or injury text in logs/traces/audit. Preview failure must not save. Never return the input unchanged while claiming AI rewrote it. AI provider selection/credentials and retention need explicit resolution; user has not authorized paid purchases.

Matching, workout fitting, billing and complete program/meal implementation are later features. Keep their interfaces/domain events compatible without implementing the entire platform or presenting mocked functionality as real. Onboarding should expose an honest NOT_STARTED/PENDING matching state until F05 exists. Build F02 preference/reference schemas needed now; defer complete nutrition/catalog functionality.

External setup and credentials described at original handoff time have since been resolved or deliberately deferred. Never request secrets in committed files or expose them in logs. Use secure configuration paths. Keep actual integration status current in provider and delivery documentation.

## Preserve Later Product Decisions

- Admin builds a program and its paired nutrition schedule in one transaction. Day counts match, including rest days. Meals/foods are reusable library content. Each user sees one AI-selected program; there is no user program catalog.
- Matching: SQL AND filter on exact training days/primary goal and supported fitness level; AiAssistedMatcher chooses one supplied candidate using descriptions, approved hints and user measurements. No model training on raw program rows.
- Retain three independent components in private Mastra: AiAssistedMatcher, AiProgramFitter and AiRewriter. No Mastra Workflow and no direct AI database credentials. NestJS validates/persists typed outputs.
- Fitter is exercise-only, on demand for a requested day with active injuries; no injury/rest day means no Fitter call. Current-version assessments and per-user restrictions; no replacement exercises. All-BLOCKED due days can be EXEMPT without fake workout completion; uncertainty never auto-clears.
- Food flags are deterministic queries using structured allergies/ingredients. Flag only the item, not the whole meal. User-confirmed same-section item/meal swaps use admin portions, no nutrition AI. Preserve history.
- Nutrition advances by calendar date independently of delayed workout completion. Equal template lengths do not resolve what to serve after the final nutrition day; that edge case and replacement-program activation timing remain open. Do not resolve these silently while implementing auth/profile.
- No gender-based carbohydrate reduction. The F08 food/meal library and USDA seed examples are now in a separate implementation slice; program schedules and personalized portions remain future work.
- Two seed entry points: seed-lookups.ts then seed-content.ts; demo users/scenarios separate. Sourced catalog foods and example meals are imported as drafts. Each stage is transactional/idempotent and catalog content requires its lookup dependencies.

## Client Delivery Artifacts

Bruno requests for implemented API routes, local/provisioned environment templates, token acquisition/refresh examples, request/response/error contracts, OTP/OAuth setup notes, required reference endpoints, migrations/seeding instructions, test evidence and a feature readiness matrix separating implemented/tested/live from externally blocked. API contract changes should be versioned and clearly communicated. Do not send messages to client developers unless separately authorized.
