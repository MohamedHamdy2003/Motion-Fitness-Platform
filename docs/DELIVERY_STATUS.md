# Delivery status — 2026-11-04

Contract: v1 / 0.4.0. F00–F03 backend implementation and OTP email authentication are deployed to AWS. GitHub Actions runs CI for `dev` and `main`; successful `main` pushes deploy to EC2 through SSM. By current user instruction, new features are to be merged only into `dev` until the user explicitly authorizes a main release.

- F03 includes role-protected exercise/food/ingredient CRUD with archive semantics, draft/publish lifecycle, immutable published revisions and recipe membership, optimistic concurrency, and validated dataset imports as drafts.
- F08 reusable food and meal catalog is merged into `dev`: sourced USDA foods, food alternatives, meal sections, editorial example meals, and Bruno requests. Imported records remain drafts and are not in production. See [F08 library walkthrough](F08_FOOD_MEAL_LIBRARY_AR.md).
- F04 admin program builder is merged into `dev` on [PR #36](https://github.com/MohamedHamdy2003/Motion-Fitness-Platform/pull/36); PR CI and post-merge CI passed, while production deployment remained skipped. It creates and publishes a program with its paired nutrition schedule atomically. See [F04 walkthrough](F04_ADMIN_PROGRAMS_AR.md).
- Exercise-video linking uses `exercise_revisions.media_id` to reference `media_assets` metadata for an object in private S3. A new 19-exercise dataset and seeder import records as drafts; manual editorial review and video uploads are required before publication. The end-user current-day/video playback API remains future athlete-facing work. See [exercise and video guide](EXERCISE_LIBRARY_AND_VIDEO_AR.md).
- Admin media supports private signed uploads, metadata/signature checks, immutable final keys, atomic ownership transfer, listing and archive protection for referenced assets. The user reports EC2, RDS and S3 connectivity working; health checks do not exercise upload/finalize. Physical cleanup remains subject to retention policy.
- Public food references exclude draft and archived foods. Publishing updates the visible title. Ingredient verification remains explicitly UNKNOWN or VERIFIED.
- Gmail SMTP accepted a real verification/recovery OTP message in an earlier test. Captured/legacy mail is not forwarded when SMTP is enabled. Email links are superseded by OTP.
- Google IDs are configured locally and live challenge issuance works. End-to-end Google mobile sign-in still requires a real Android ID token and nonce round trip. Sign in with Apple is deferred by user request.
- AI rewrite adapter and private service exist, but no live provider/model is enabled. Matching, fitting, billing and the admin UI remain later features.
- Production uses AWS EC2 + RDS PostgreSQL + private S3. The user verified the public HTTPS `/health/ready` endpoint on 2026-11-02; that check confirmed the API and database, not S3 or SMTP.

Current F04 CI on PR #36 and its `dev` merge: format, lint, typecheck, build, migrations, seeders, PostgreSQL integration, and Bruno passed; `Deploy EC2` was skipped because deployment only runs from `main`.

[Mobile local setup](MOBILE_LOCAL_SETUP_AR.md) · [F03 walkthrough](F03_CONTENT_AR.md) · [OTP and OAuth](OTP_OAUTH_SETUP_AR.md).

Staging is a separate environment and is not provisioned. `bruno/environments/staging.bru` intentionally uses a `.invalid` placeholder. Production base URL and AWS runbook are in [AWS deployment](AWS_DEPLOYMENT_AR.md).
