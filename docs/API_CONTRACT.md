# Motion API contract v1 / 0.3.0

All routes below use `/api/v1`. JSON request objects reject unknown keys; no client-supplied user IDs or roles. All protected requests use `Authorization: Bearer <accessToken>`. Timestamps are ISO 8601 UTC; date of birth is `YYYY-MM-DD`. PostgreSQL decimal values in responses are **decimal strings**, including height and weight; clients submit JSON numbers. UUIDs are server-generated. See [complete synthetic response/error examples](examples/responses.json).

Responses include `X-Request-Id` and `Cache-Control: no-store`. Client request IDs are not trusted. Error bodies are always:

```json
{
  "code": "REVISION_CONFLICT",
  "message": "REVISION_CONFLICT",
  "details": null,
  "requestId": "9897942b-1e2f-44fb-a932-d3b5e1c8b260"
}
```

Validation errors return `400 VALIDATION_ERROR`, with paths and validation codes in `details`; rejected values and raw provider errors are excluded. Common errors: `401 UNAUTHENTICATED`, `SESSION_REVOKED`, `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN`; `403 FRESH_REAUTHENTICATION_REQUIRED`; `404 NOT_FOUND`; `409 CONFLICT`, `REVISION_CONFLICT`, `IDEMPOTENCY_CONFLICT`; `429 RATE_LIMITED`; `503 *_NOT_CONFIGURED`. Internal failures return `500 INTERNAL_ERROR` without SQL, tokens or sensitive text.

## Authentication

| Method/route                        | Request                                                                                                         | Success                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| POST `/auth/register`               | `email`, `password`                                                                                             | 201, session plus `{user:{id,email,verified:false},emailDelivery:"QUEUED"}` |
| POST `/auth/login`                  | `email`, `password`                                                                                             | 200, session                                                                |
| POST `/auth/refresh`                | `refreshToken`                                                                                                  | 200, rotated session tokens                                                 |
| POST `/auth/verify-email`           | `email`, `code`                                                                                                 | 200, `{status:"VERIFIED"}`                                                  |
| POST `/auth/resend-verification`    | `email`                                                                                                         | 202, generic accepted response                                              |
| POST `/auth/forgot-password`        | `email`                                                                                                         | 202, identical accepted response for eligible/unknown accounts              |
| POST `/auth/reset-password`         | `token`, `newPassword`, `confirmPassword`                                                                       | 200, `{status:"PASSWORD_CHANGED",requiresLogin:true}`                       |
| POST `/auth/change-password`        | `currentPassword`, `newPassword`, `confirmPassword`                                                             | Protected, 200; revokes all devices                                         |
| POST `/auth/logout`                 | `{}`                                                                                                            | Protected, 200, `{status:"LOGGED_OUT"}`                                     |
| POST `/auth/logout-all`             | `{}`                                                                                                            | Protected, 200; every device revoked                                        |
| POST `/auth/challenges`             | `provider:GOOGLE\|APPLE`, `purpose:SIGN_IN\|LINK\|REAUTHENTICATE`                                               | 201, `{challengeId,nonce,expiresIn:300}`; LINK/REAUTHENTICATE protected     |
| POST `/auth/google`                 | `idToken`, `challengeId`, optional `name`                                                                       | 200, session; provider configuration required                               |
| POST `/auth/apple`                  | `idToken`, `authorizationCode`, `challengeId`, optional `name`                                                  | 200, session after verified code exchange                                   |
| POST `/auth/reauthenticate`         | `method:PASSWORD`, `password`, `purpose:LINK\|DELETE`; or method GOOGLE/APPLE and provider token/challenge/code | Protected, 200, `{reauthenticationToken,expiresIn:300,purpose}`             |
| POST `/auth/identities/google/link` | `idToken`, `challengeId`, `reauthenticationToken`                                                               | Protected, 200, `{status:"LINKED",provider:"GOOGLE"}`                       |
| POST `/auth/identities/apple/link`  | Same plus `authorizationCode`                                                                                   | Protected, 200 after Apple code exchange                                    |

Passwords are 12–128 characters. Normalize email with trim/lowercase. Email OTPs contain six digits, expire after 10 minutes, and allow five attempts. Resends have a 60-second cooldown and invalidate the old code. POST `/auth/verify-reset-code` accepts `{email,code}` and returns a single-use `resetToken` valid for five minutes; send it as `token` to `/auth/reset-password`. OTPs cannot be used directly as reset tokens. Reset/change revokes every session and outstanding proof/reset token. Social-only accounts return `PASSWORD_LOGIN_NOT_ENABLED` for password changes; forgot password does not create local credentials.

Session example (opaque placeholders, not usable secrets):

```json
{
  "accessToken": "<signed-jwt>",
  "refreshToken": "<opaque-random-token>",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

Access lifetime is 15 minutes; device session and rotating refresh family expire 30 days after original login. JWT verifies HS256 only, issuer `motion-api`, audience `motion-mobile`, expiry, subject and session. Account/session status is checked on protected requests. Mobile serializes refresh calls: concurrent reuse is treated as replay and revokes the family. Tokens belong in platform secure storage, never query strings.

Email-request example:

```json
{
  "status": "ACCEPTED",
  "message": "If the account is eligible, an email will be sent."
}
```

Delivery-dependent routes return `503 EMAIL_NOT_CONFIGURED` when disabled. `QUEUED` means durable queued work, not confirmed external delivery. Local capture never sends mail. Public auth requests are limited by IP (30/15 minutes) and selected email/user operations by identity (6/15 minutes). Refresh has a separate 120/15 minute IP limit; rewrite is 10/minute/user. On 429 stop retrying rapidly.

## Profile and onboarding

| Method/route              | Request                                                                 | Response                                                                                             |
| ------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET `/me`                 | —                                                                       | 200 aggregate described below                                                                        |
| PATCH `/me`               | `expectedRevision` and one or more profile fields                       | 200 full profile with incremented `profile_revision`                                                 |
| PUT `/me/onboarding`      | `expectedRevision`, required profile fields below, `initialMeasurement` | 200 `{status:"COMPLETED",profile_revision,matching:{status:"PENDING",reason:"F05_NOT_IMPLEMENTED"}}` |
| GET `/me/settings`        | —                                                                       | 200 `{reminders,theme,quiet_hours,version}`                                                          |
| PATCH `/me/settings`      | `expectedVersion`, optional `reminders`, `theme`, `quiet_hours`         | 200 updated settings/version                                                                         |
| GET `/me/matching/status` | —                                                                       | `{status:"NOT_STARTED"\|"PENDING",reason:"F05_NOT_IMPLEMENTED"}`                                     |

All routes in this section are protected. Profile fields: `name`, optional nullable `phone`; `height_cm`; current `weight_kg`; `primary_goal:FAT_LOSS|STRENGTH_HYPERTROPHY`; `fitness_level:BEGINNER|INTERMEDIATE|ADVANCED`; `training_days_per_week:2|3|4|5`; IANA `timezone`; BCP47-style `locale`; `date_of_birth`; nullable `avatar_media_id` belonging to this user and finalized READY.

Onboarding requires name, height, primary goal, fitness level, training days, timezone, locale, date of birth and a flat `weight_kg` field. It updates the aggregate in one transaction. Approved policy (2026-10-31): strictly older than 18, checked against the user's local date; date-only eligibility starts the day after their 18th birthday. In non-leap years, a February 29 birthday has its anniversary on March 1. Age failures return `422 AGE_NOT_ELIGIBLE`, including edits to birth date/timezone. Current weight has no measurement date or expiry. Historical tracking is deferred.

Update current weight with PATCH /me:

```json
{ "expectedRevision": 1, "weight_kg": 80.5 }
```

Weight and height are positive JSON numbers; technical abuse bounds are 10000 kg and 1000 cm, not clinical acceptance ranges. Weight is required during onboarding and nullable until supplied in a new account. Each accepted profile edit increments profile_revision. No measurement dates, history, date filters or separate measurement routes are provided. Old measurement routes return 404; legacy date/initialMeasurement fields are rejected by strict request validation.

GET /me returns `{user,profile,injuries,injury_revision,food_preferences,matching}` under a repeatable-read snapshot. Current weight is in `profile.weight_kg` as a decimal string or null. User exposes id/email/verified_at only. Injuries/preferences remain separate tables. No BMI classifications, programs, billing entitlement or AI matching are fabricated.

Settings: `theme:SYSTEM|LIGHT|DARK`, reminders boolean, nullable `quiet_hours:{start:"22:00",end:"07:00"}`. These settings do not claim push delivery exists.

## Injuries and transient rewrite

| Method/route                | Request                                                | Response                                                                     |
| --------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| GET `/me/injuries`          | `limit`, `offset`                                      | 200 active `{items,limit,offset}`                                            |
| POST `/me/injuries/rewrite` | body area, side, `description`, integer `draftVersion` | 201 preview `{description,draftVersion,instructionVersion,previewOnly:true}` |
| POST `/me/injuries`         | body area, side, final `description`, `confirmed:true` | 201 `{injury,injury_revision}`                                               |
| PATCH `/me/injuries/:id`    | same plus `expectedVersion`                            | 200 `{injury,injury_revision}`                                               |
| DELETE `/me/injuries/:id`   | `{expectedVersion,confirmed:true}`                     | 200 `{status:"REMOVED",version,injury_revision}`                             |

Protected. Body area uses `body_area_code` from references. Side optional/null or `LEFT|RIGHT|BOTH|UNSPECIFIED`; final description 1–2000 trimmed characters. Create example:

```json
{
  "body_area_code": "KNEE",
  "side": "LEFT",
  "description": "The final description I reviewed and accepted.",
  "confirmed": true
}
```

Injury responses include id/user_id/body_area_code/side/description/version/status/confirmed_at/removed_at. Cross-user access is 404. Concurrent stale edits/removals are 409. Removal deactivates the record. Accepted injury changes atomically increment injury_revision and create a text-free invalidation event; F17 consumes the revision in a later slice. It does not currently run fitting.

Rewrite does not write injury/profile state or enqueue a save. Client increments `draftVersion` whenever any form input changes and discards responses whose version is no longer current. Preview failure/cancellation saves nothing. After editing the preview, the user explicitly confirms and submits the final text. Motion stores only that accepted description; draft/unconfirmed output is excluded from DB, jobs, logs, traces and audit. Rewrite audit contains status, provider/model version, instruction version, duration and failure code only.

No configured private service/retention approval: `503 AI_REWRITE_NOT_CONFIGURED`. Provider timeout/error: `503 AI_REWRITE_UNAVAILABLE`. Invalid/unchanged output: `502 AI_REWRITE_INVALID_OUTPUT`. No fake success or diagnosis. Live model behavior still needs provider configuration and evaluated acceptance fixtures.

## Food preferences and references

Protected `GET /me/food-preferences` and `PUT /me/food-preferences`. PUT replaces the whole selection using:

```json
{
  "expectedRevision": 0,
  "allergen_codes": ["MILK"],
  "disliked_food_ids": [],
  "excluded_food_ids": []
}
```

Success returns `{revision:1,allergen_codes:["MILK"],disliked_food_ids:[],excluded_food_ids:[]}`. Invalid lookup IDs fail and roll back; stale revisions return 409. Food preference revision is independent of injury revision. No nutrition AI calls.

Protected reference routes: GET `/references/body-areas` → `{items:[{code,parent_code}]}`; `/references/allergens` → `{items:[{code,label}]}`; `/references/foods?search=&limit=30&offset=0` → `{items:[{id,name,kind}],limit,offset,contentStatus:"CATALOG_NOT_SEEDED"}`; `/references/onboarding` → allowed enums plus configured policy fields/null and policy status. The food library is honestly empty until future approved content is supplied. Lookup allergen choices are starter form identifiers, not an approved global allergen safety catalog.

## Media and account deletion

Protected POST `/media/upload-intents` with `{mime:"image/png",size:1024}` → 201 `{id,uploadUrl,method:"PUT",headers,expiresIn:300}`. JPEG/PNG/WebP only; max 5 MiB. Upload to the returned URL, then protected POST `/media/:id/finalize` with `{}` → 201 `{id,status:"READY"}` after size/MIME/signature checks and conditional copy into an immutable final key. Protected GET `/media/:id` returns owned metadata and, for READY assets, a five-minute `downloadUrl`/`expiresIn`. Use the READY ID as `avatar_media_id` in PATCH /me. No configured S3 bucket: 503; wrong owner: 404. Live storage has not been connected.

Protected POST `/me/account-deletion` with `{reauthenticationToken:"<DELETE-proof>"}` returns 202 `{status:"PENDING",trackingToken,expiresIn:2592000,subscriptionCancellation:"NOT_INTEGRATED",message}`. It immediately sets DELETION_PENDING and revokes all sessions. Poll GET `/me/account-deletion` using **`X-Deletion-Token`**, without Bearer: `{status,requested_at,completed_at}` only. Tracking secret is hashed in DB and expires after 30 days. This endpoint never exposes account data.

Cleanup waits for `DELETION_RETENTION_APPROVED=true`; completion is never reported early. Apple revocation retries, data/file deletion and anonymized tracking state are handled by the durable job. `DATA_DELETED_PROVIDER_REVOCATION_FAILED` explicitly distinguishes provider failure from complete external cleanup. Store subscriptions are not cancelled in this slice.

## Idempotency and concurrency

Send `Idempotency-Key` (8–128 ASCII letters/digits/underscore/hyphen) on POST injuries and PUT onboarding. Keys are scoped by authenticated user and operation and retained 7 days. Same key + same parsed body reuses the resource without another write; same key + different body returns 409. Replayed injury/onboarding responses report current resource/revision state, not an archived sensitive response. JSON numbers/revisions must be numbers, not strings.

Profile/settings/preferences/injury changes use expected revisions/versions. On conflict, refetch current state, reconcile and explicitly retry. Writes serialize on the user row; model/provider calls stay outside DB transactions. Identity linking and deletion proofs are purpose-, session- and user-bound, single-use, and five minutes old at most.

## Foundation

Public GET `/health` → `{status:"ok",version:"0.3.0"}`; GET `/health/ready` checks DB and unapplied migrations. Ready does not imply external providers are connected: it separately reports `NOT_CONFIGURED`, `LOCAL_CAPTURE`, or `CONFIGURED_UNVERIFIED`. An outstanding DB migration/database failure returns 503 NOT_READY.

## F03 content library

Administrative endpoints require ADMIN or CONTENT_EDITOR from current database roles. See [F03 walkthrough](F03_CONTENT_AR.md). GET lists use limit (1–100, default 30) and offset. Exercise and food creation accepts `{slug, content}`; PATCH replaces the full validated content using `{expectedRevision, content}`. POST `/:id/publish` and DELETE `/:id` accept `{expectedRevision}`. GET `/:id` includes all revisions. A published revision cannot be overwritten; editing creates a draft successor. Deletion archives the identity.

Ingredient metadata uses `{slug, content}` on creation and `{expectedRevision, content}` on PATCH, where expectedRevision equals metadata_version. Verification status is UNKNOWN or VERIFIED; unknown nutrient values are null. Sources and reuse notes are required in exercise/food payloads. No automatically sourced or approved production content is included.

Admin media upload/finalize/read endpoints live under `/admin/media`. JPEG/PNG/WebP/MP4 uploads are limited to 100 MiB, checked against object metadata and initial signature bytes, and copied to a separate final key. DELETE archives an unreferenced library asset; existing signed URLs expire within five minutes. These APIs require configured S3 storage and do not expose a public athlete content catalog.
