# Delivery status — 2026-10-31

Contract: v1 / 0.4.0. F00–F03 backend implementation and OTP email authentication are implemented locally. The release PR and GitHub Actions record remote validation and merge status.

- F03 includes role-protected exercise/food/ingredient CRUD with archive semantics, draft/publish lifecycle, immutable published revisions and recipe membership, optimistic concurrency, and validated local dataset imports as drafts. Production scientific content has not been supplied or approved.
- Admin media supports private signed uploads, metadata/signature checks, immutable final keys, atomic ownership transfer, listing and archive protection for referenced assets. External S3 storage remains unconfigured; fixture transports exercise the integration boundary. Physical cleanup remains subject to retention policy.
- Public food references exclude draft and archived foods. Publishing updates the visible title. Ingredient verification remains explicitly UNKNOWN or VERIFIED.
- Gmail SMTP accepted real verification and recovery OTP emails in this session. Captured/legacy mail is not forwarded when SMTP is enabled. Email links are superseded by OTP.
- Google IDs are configured locally and live challenge issuance works. End-to-end Google mobile sign-in still requires a real Android ID token and nonce round trip. Sign in with Apple is deferred by user request.
- AI rewrite adapter and private service exist, but no live provider/model is enabled. Matching, fitting, billing, program/meal construction and the admin UI remain later features.
- Local PostgreSQL, migrations, Docker and deployment preparation exist. No Oracle/Neon/cloud deployment or public HTTPS endpoint is claimed.

Validation target for this release: 38 PostgreSQL tests, 11 backend unit tests, 3 private-AI fixture tests, plus the existing Bruno smoke suite and required CI build/type/lint/format checks.

[Mobile local setup](MOBILE_LOCAL_SETUP_AR.md) · [F03 walkthrough](F03_CONTENT_AR.md) · [OTP and OAuth](OTP_OAUTH_SETUP_AR.md).
