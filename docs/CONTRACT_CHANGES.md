## 0.4.0 — Email OTP (2026-10-31)

Breaking: verify-email takes email and six-digit code instead of a link token. Password recovery adds POST /auth/verify-reset-code; its resetToken is passed as token to reset-password. Codes last 10 minutes with five attempts; the reset proof lasts five minutes. Resend cooldown is 60 seconds. Previous email/reset tokens are invalidated by migration. RESET_LINK_BASE and VERIFY_LINK_BASE are no longer needed. Pre-upgrade or capture mail jobs are not automatically sent by SMTP.

# API contract changes

## 0.3.0 — 2026-10-31

The initial product now keeps a single current weight in the profile, without measurement dates or weight history. Height remains a profile field. Tracking history is deferred to a future feature.

- GET `/me` returns current weight as `profile.weight_kg` (decimal string or null until provided).
- PATCH `/me` accepts `weight_kg` with the existing `expectedRevision`; updating it replaces the current value.
- PUT `/me/onboarding` requires a flat `weight_kg` field. The former `initialMeasurement` object is rejected.
- POST/GET `/me/measurements` are removed and return 404.
- `measured_at`, `latest_weight`, `measurement_freshness_policy_days`, and the reference-list expiry field are removed from the active contract.
- Measurement dates/history are not collected. General account/session/onboarding timestamps remain operational metadata.

Example weight update:

```json
{ "expectedRevision": 1, "weight_kg": 80.5 }
```

Run `CurrentProfileWeight1793404801000` after the earlier migrations. It copies the latest existing weight into the profile, increments affected profile revisions, clears old measurement/onboarding idempotency keys, then drops the old history table. No measurement timestamp is copied to the profile. Rollback preserves the current profile weight and creates an empty compatibility table; it cannot reconstruct deleted history or dates. Take a backup before downgrading if historical restoration is required. Use new onboarding idempotency keys for the changed payload.

Bruno now contains 44 reference requests and 19 smoke requests; weight updates use the Profile folder and the existing profile API. There is no separate Measurements folder.

## 0.2.0 — 2026-10-31

User-approved measurement scope: weight history in kg and profile height in cm. Body-fat collection is removed from the current product scope.

- POST `/me/measurements` now requires `weight_kg` and `measured_at`.
- Onboarding `initialMeasurement` uses that same weight-only contract.
- Removed fields are rejected with `400 VALIDATION_ERROR`, including when sent alongside valid weight.
- Measurement rows no longer contain `body_fat_percent` or `body_fat_method`.
- GET `/me` no longer returns `latest_body_fat`.
- GET `/references/onboarding` no longer advertises body-fat methods or their configuration status.
- BODY_FAT_METHODS configuration is removed. The API prefix remains `/api/v1`.

Run `RemoveBodyFat1793404800000` before starting this version. The migration preserves weight values, IDs and dates, removes observations without a weight and their measurement idempotency keys, then drops the removed columns and makes weight mandatory. Affected profile revisions increment. Rollback restores the previous schema only; deleted observations cannot be recovered by migration rollback.

Clients must remove the old fields from forms, requests and response models. Use new idempotency keys when submitting a changed request shape. Bruno and examples reflect this contract. Strictly-over-18 eligibility and measurements without expiry remain in force.
