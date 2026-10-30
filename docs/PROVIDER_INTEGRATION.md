# External integration boundaries

## Email

`MAIL_MODE=smtp` supports Gmail SMTP (`smtp.gmail.com`, 587 with mandatory STARTTLS, or 465 with TLS). Set SMTP_USER, SMTP_PASSWORD, MAIL_FROM, MAIL_ENCRYPTION_KEY, RESET_LINK_BASE and VERIFY_LINK_BASE using local ignored files or provider secrets. A Google app password requires 2-Step Verification and may be unavailable under some account policies; do not use the Google account password. [Google account instructions](https://support.google.com/accounts/answer/185833).

No Google account/app password or real recipient has been configured or tested. The user authorizes no outgoing test email until a recipient is specified. The SMTP adapter uses no debug logging. A crash after SMTP accepts a message can cause duplicate delivery; challenge tokens remain single-use. HTTPS Resend is an optional adapter, not a configured integration.

Set deep-link bases to the client's approved URLs. Backend appends `?token=<opaque-token>` (or adds the parameter to existing query parameters). Android App Links/iOS Universal Links association files and domains require the mobile team/domain owner. Do not ship `motion-local://` capture links. Reset screen submits token/newPassword/confirmPassword to the reset endpoint and requires a fresh login afterward.

## Google / Apple

Provide actual Android/iOS/web client audiences as comma-separated GOOGLE_CLIENT_IDS and APPLE_CLIENT_IDS. Google signing keys come only from Google's JWKS; Apple keys only from Apple's JWKS. Verify RS256 signature, allowed issuer/audience, expiry/issued-at/subject/nonce; Google authorized-party claims, when present, must be allowed. Subject identifies the account, never matching email.

1. Call challenges with SIGN_IN. The response nonce must be included **exactly** in the provider's OIDC request; do not silently switch between raw and SHA-256 nonce conventions. If the chosen mobile SDK hashes its nonce automatically, align that SDK integration before live testing.
2. Submit the resulting ID token and challenge ID. Apple also needs its authorization code for server-side exchange.
3. For linking, authenticate the current Motion account and request a LINK proof through reauthenticate. Request a provider LINK challenge in that same session, authenticate that provider, then submit proof/token/challenge to the link route.
4. A colliding email returns ACCOUNT_LINK_REQUIRED. An identity belonging to another user cannot be linked. No implicit account merge.

Apple additionally requires Team ID, key ID, private signing key and a separate 32-byte hex encryption key. The backend generates an ES256 client secret, exchanges codes, verifies the exchanged token matches subject/nonce, and encrypts the refresh credential for revocation. Never commit a `.p8` file. Apple first-login name is accepted as optional display data; it is not an authorization claim. Private Relay emails are supported as opaque addresses.

Tests use real fixture signatures/JWKS and orchestration fixtures, including forged/expired/wrong-audience tokens, nonce reuse, email collision and linking conflicts. These tests are not live Google/Apple app verification. Provider accounts, client IDs, entitlements and Apple keys remain external dependencies.

## Private AiRewriter

The separate `ai-service/` contains only the minimal F16 INJURY_DESCRIPTION rewrite component. Matcher, Fitter, program hints, workflows and AI database access are not implemented in this slice. NestJS sends minimized body-area/side/description fields without identity. The private service validates the same bounded contract, authenticates a service Bearer token and has no database credentials or tools.

Set AI_MODEL to an approved Mastra `provider/model` ID and configure that provider's credential. Provider/model choice, allowed free usage and provider retention are still unresolved; no model purchase or live model call has occurred. Set AI_RETENTION_APPROVED only after checking the chosen provider's actual data-handling configuration. Motion does not claim provider zero retention.

Mastra memory/storage/exporters are not configured, its logger is disabled and generation tracing hides both input and output. Private server returns error codes only. Deployment ingress must not expose port 3001; NestJS-to-service Bearer token is still mandatory. In the supplied Docker network only, `http://ai:3001/internal/v1/rewrite` is allowed; externally hosted services require HTTPS. Never give this process DATABASE_URL.

Preview timeout is 12 seconds in NestJS and model timeout 10 seconds; there are no automatic retries or fallback success. Unchanged output fails. Structured output does not prove medical or semantic correctness: before activation, evaluate preservation of location, side, negation, uncertainty and absence of invented diagnosis. The client explicitly confirms every save. The fixture test suite validates the boundary, not clinical accuracy.

## Storage and deletion

S3-compatible bucket/endpoint/region and scoped credentials must be supplied separately. No live storage exists. Only owner-scoped avatar intents/finalization/metadata are in this delivery; the full F03 content library is deferred. Configure a private bucket and CORS for the native/upload clients as appropriate. Require a bucket lifecycle rule expiring the `uploads/` prefix after one day; short-lived signed upload URLs can otherwise recreate an abandoned temporary object after finalization or deletion. Final avatar keys use a different prefix and conditional immutable copy.

Deletion never means automatic store-subscription cancellation. Retention remains pending approval. Until then, account status and sessions are revoked immediately and deletion jobs report a policy blocker. After approval, the job removes owned files and relational data, retries Apple revocation, and retains only expiring anonymous tracking state. Unresolved provider revocation is reported explicitly after five attempts instead of indefinitely retaining user data.
