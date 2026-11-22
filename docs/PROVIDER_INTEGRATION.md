# External integration boundaries

## Email

`MAIL_MODE=smtp` supports Gmail SMTP (`smtp.gmail.com`, 587 with mandatory STARTTLS, or 465 with TLS). Set SMTP_USER, SMTP_PASSWORD, MAIL_FROM, MAIL_ENCRYPTION_KEY using local ignored files or provider secrets. A Google app password requires 2-Step Verification and may be unavailable under some account policies; do not use the Google account password. [Google account instructions](https://support.google.com/accounts/answer/185833).

Gmail SMTP was configured and accepted a real verification/recovery OTP email in an earlier test. This confirms that test only; it does not guarantee future delivery. The SMTP adapter uses no debug logging. A crash after SMTP accepts a message can cause duplicate delivery; challenge tokens remain single-use. HTTPS Resend is an optional adapter, not a configured integration.

Verification and password recovery use six-digit OTP codes; the backend does not require verification or reset deep-link base URLs. The app submits email/code, exchanges a recovery code for a short-lived single-use reset token, then requires a fresh login after changing the password. See [OTP and OAuth setup](OTP_OAUTH_SETUP_AR.md).

## Google / Apple

Google Android and Web OAuth client IDs are configured locally. Google signing keys come only from Google's JWKS; Apple keys only from Apple's JWKS. Verify RS256 signature, allowed issuer/audience, expiry/issued-at/subject/nonce; Google authorized-party claims, when present, must be allowed. Subject identifies the account, never matching email. Challenge issuance works; a real Android sign-in still requires the mobile app to send a valid ID token and challenge/nonce. Apple sign-in is deferred by user request.

1. Call challenges with SIGN_IN. The response nonce must be included **exactly** in the provider's OIDC request; do not silently switch between raw and SHA-256 nonce conventions. If the chosen mobile SDK hashes its nonce automatically, align that SDK integration before live testing.
2. Submit the resulting ID token and challenge ID. Apple also needs its authorization code for server-side exchange.
3. For linking, authenticate the current Motion account and request a LINK proof through reauthenticate. Request a provider LINK challenge in that same session, authenticate that provider, then submit proof/token/challenge to the link route.
4. A colliding email returns ACCOUNT_LINK_REQUIRED. An identity belonging to another user cannot be linked. No implicit account merge.

Apple additionally requires Team ID, key ID, private signing key and a separate 32-byte hex encryption key. The backend generates an ES256 client secret, exchanges codes, verifies the exchanged token matches subject/nonce, and encrypts the refresh credential for revocation. Never commit a `.p8` file. Apple first-login name is accepted as optional display data; it is not an authorization claim. Private Relay emails are supported as opaque addresses.

Tests use real fixture signatures/JWKS and orchestration fixtures, including forged/expired/wrong-audience tokens, nonce reuse, email collision and linking conflicts. These tests are not live Google/Apple app verification. Provider accounts, client IDs, entitlements and Apple keys remain external dependencies.

## Private Mastra service

The separate `ai-service/` implements the F16 injury-description preview and F05 program selection on the development branch. NestJS sends body area, side and the draft description for rewrite previews. Matching sends the validated profile snapshot and the programs filtered for eligibility. Neither route receives direct account identifiers. The service validates bounded requests, authenticates a service Bearer token, and has no database credentials or tools. Exercise fitting and program-hint rewriting remain planned. [F05 matching](F05_MATCHING_AR.md).

Set AI_MODEL to an approved Mastra `provider/model` ID and configure that provider's credential. Provider/model choice, allowed free usage and provider retention are still unresolved; no model purchase or live model call has occurred. Set AI_RETENTION_APPROVED only after checking the chosen provider's actual data-handling configuration. Motion does not claim provider zero retention.

Generation tracing hides input and output and the private service uses a disabled logger. AWS Compose starts the API and Caddy. A separately deployed Mastra service needs private connectivity and a service Bearer token. The Backend accepts HTTP on the internal `ai:3001` address in a private network and requires HTTPS for other hosts in production. Keep `DATABASE_URL` exclusively on the Backend side.

Preview timeout is 12 seconds in NestJS and model timeout 10 seconds; there are no automatic retries or fallback success. Unchanged output fails. Structured output does not prove medical or semantic correctness: before activation, evaluate preservation of location, side, negation, uncertainty and absence of invented diagnosis. The client explicitly confirms every save. The fixture test suite validates the boundary, not clinical accuracy.

## Storage and deletion

The user reports the EC2 IAM Role and private S3 bucket are connected. Health checks do not verify uploads; validate a real upload-intent, PUT, finalize and read flow before relying on a particular bucket configuration. The implementation supports owner-scoped avatar and admin-library media. Configure a private bucket and CORS for native/upload clients as appropriate. Require a bucket lifecycle rule expiring the `uploads/` prefix after one day; short-lived signed upload URLs can otherwise recreate an abandoned temporary object after finalization or deletion. Final avatar keys use a different prefix and conditional immutable copy.

Deletion never means automatic store-subscription cancellation. Retention remains pending approval. Until then, account status and sessions are revoked immediately and deletion jobs report a policy blocker. After approval, the job removes owned files and relational data, retries Apple revocation, and retains only expiring anonymous tracking state. Unresolved provider revocation is reported explicitly after five attempts instead of indefinitely retaining user data.

Email verification and password recovery use emailed OTP codes. No reset/verification link configuration is required. Old captured jobs are never sent when SMTP is enabled; new jobs are tagged with their delivery mode.
