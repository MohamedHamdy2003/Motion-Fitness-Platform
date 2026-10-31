# API contract changes

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
