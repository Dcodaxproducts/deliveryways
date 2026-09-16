# FeastFlow — Issues and Fix Tracker

Last updated: 16 September 2026

This file is the source of truth for reported defects, investigation results, fixes, verification, and deployment status. Product updates, planned improvements, and UI modernization work are tracked separately in [FEASTFLOW-UPDATES.md](./FEASTFLOW-UPDATES.md).

## Status Legend

- **Confirmed:** reproduced or supported by runtime, configuration, database, or source evidence.
- **Fixed in source:** implemented, verified, and pushed, but not necessarily deployed.
- **Configuration required:** code alone cannot complete the fix; an environment or provider setting is still needed.
- **Staging verified:** deployed and proven on FeastFlow Staging.
- **Production verified:** deployed and proven on FeastFlow Production.
- **Decision required:** the report is a valid gap, but expected behavior must be approved before implementation.
- **Not confirmed:** available evidence does not currently prove a defect.

## Reported Staging Issues — 15 September 2026

The initial audit used live Staging traffic, configuration, database, and source inspection. It was read-only: no application code, database records, environment values, containers, Staging services, or Production services were changed during validation.

### Confirmed defects

|   # | Area                           | Valid issue                                                                                                                                                                                                                                                             | Evidence / scope                                                                                                                                                                                                                                                                                                                                                                                               | Current status                                                                                                                                                                                                                                                                                                          |
| --: | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Cross-app maps and addresses   | Maps, Places autocomplete, current-location lookup, and reverse geocoding fail across Superadmin Brand Owner addresses, Partner branch creation, Storefront location selection, and Checkout address selection. Some searches remain loading and maps can render blank. | The previously deployed frontends contained an older Google key. The protected Staging key succeeds from the Partner Staging origin with `PlacesServiceStatus.OK`; the deployed Partner, Superadmin, and Customer images contain that exact key, verified by hash without exposing it. This consolidates Superadmin #1, Partner #3–4, and Restaurant Domain #1–2 and #5–7 under one configuration/build issue. | **Staging verified.** All three frontends were rebuilt with the existing protected Staging key and deployed on 16 September 2026. No new key was required.                                                                                                                                                              |
|   2 | Superadmin global settings     | Saving an empty or invalid primary/secondary color exposes a raw regular-expression validator message.                                                                                                                                                                  | Live PATCH originally returned HTTP 400 with technical class-validator output.                                                                                                                                                                                                                                                                                                                                 | **Deployed to Staging; acceptance pending.** Blank colors now clear correctly and malformed nonblank colors return readable field-specific messages. Source tests, API verification, migration gate, container health, and public smoke checks passed; an authenticated UI acceptance check remains.                    |
|   3 | Superadmin employee onboarding | Newly created employees do not receive an invitation email.                                                                                                                                                                                                             | The previous staff-create workflow created credentials without sending an invitation. Staging email delivery was also disabled.                                                                                                                                                                                                                                                                                | **Staging verified.** Staging SMTP is enabled, the API sends the invitation, and the response preserves `meta.invitationEmailSent`. A live employee creation produced delivery confirmation and the temporary employee was removed. Partner and Superadmin also warn when delivery is unavailable.                      |
|   4 | Partner restaurant context     | Dashboard and category requests can use a stale unauthorized restaurant selection and return load/network errors.                                                                                                                                                       | Tester traffic used restaurant `cmtvc82...` and received HTTP 403; selecting authorized restaurant `cmu28s1...` restored HTTP 200/201 behavior.                                                                                                                                                                                                                                                                | **Deployed to Staging; acceptance pending.** Partner now clears persisted Business Admin restaurant/branch state before scoped requests run. Automated regression tests, production build, container health, and public smoke checks passed; an authenticated stale-session UI acceptance check remains.                |
|   5 | Customer signup OTP            | Storefront registration advances to OTP verification, but no OTP email arrives.                                                                                                                                                                                         | Staging previously ran with `EMAIL_ENABLED=false` and no SMTP credentials. The API therefore auto-verified registrations and created no OTP, while the previous Customer UI always opened the OTP screen.                                                                                                                                                                                                      | **Staging verified.** Staging SMTP is enabled and the Customer flow handles `isVerified`, `verificationEmailSent`, delivery failure, resend, and OTP purpose. Live registration returned `verificationEmailSent=true` and `isVerified=false`; an OTP was stored, resend rotated it, and both test records were removed. |
|   6 | Guest favorites                | Restaurant and menu-item favorite controls are visible to guest users.                                                                                                                                                                                                  | Guest sessions receive tokens, while favorite visibility checks only for token presence. Restaurant Domain #4 and #11 are duplicate symptoms.                                                                                                                                                                                                                                                                  | **Staging verified.** Guest sessions no longer load or mutate favorites, favorite controls are hidden, and direct favorites-page access shows the login state. Live guest acceptance confirmed zero favorites links and zero favorites API requests.                                                                    |
|   7 | Guest profile name             | A supplied guest name is stored, but the storefront profile displays `User`.                                                                                                                                                                                            | The navbar intentionally substitutes the generic label for guest accounts instead of rendering the stored name.                                                                                                                                                                                                                                                                                                | **Staging verified.** Navbar account controls render the stored profile name for customer and guest sessions, retaining `User` only as a missing-name fallback. A temporary live guest displayed its supplied name and was removed after verification.                                                                  |
|   8 | Customer cart feedback         | A rejected add-to-cart request can display both an incorrect success toast and the limit error.                                                                                                                                                                         | The optimistic handler emits success before the API response, then rolls back and emits an error after HTTP 400.                                                                                                                                                                                                                                                                                               | **Deployed to Staging; interaction acceptance pending.** All three add-to-cart entry points emit success only after the API commits; rejected optimistic mutations only emit the error. Source regression and deployed-image verification passed.                                                                        |
|   9 | Storefront footer              | The leftmost desktop footer column is misaligned relative to the remaining columns.                                                                                                                                                                                     | The footer columns use asymmetric desktop padding.                                                                                                                                                                                                                                                                                                                                                             | **Deployed to Staging; visual acceptance pending.** The inconsistent desktop padding is removed so all four footer columns align to the shared grid. Source visual verification and deployed-image checks passed.                                                                                                       |

## Batch 1 Fix Record — Issues 1–5

Status: deployed to Staging on 16 September 2026. Issues 1, 3, and 5 are Staging verified; issues 2 and 4 are deployed with authenticated UI acceptance still pending.

| Application  | Commit                         | Covered work                                                                                                                          |
| ------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Platform API | `b4a3cfb` (includes `0291eab`) | Readable global-settings color validation, employee invitation delivery, and response metadata preserved through the global envelope. |
| Partner      | `9b3a296` (includes `617c524`) | Invitation-delivery feedback using response metadata and stale restaurant/branch context clearing.                                    |
| Superadmin   | `5f917a2` (includes `eb8e806`) | Invitation-delivery feedback using response metadata.                                                                                 |
| Customer     | `1f5931a`                      | Signup/OTP result handling, resend recovery, and required OTP purpose.                                                                |

Verification completed before push:

- Platform API: TypeScript, build, lint, and 106 suites / 1,213 tests.
- Partner: lint, TypeScript, 114 suites / 1,039 tests, internationalization/import/UI guards, and 65-route build.
- Superadmin: lint, TypeScript, message parity, and build.
- Customer OTP follow-up: lint, TypeScript, 83 files / 588 tests, bilingual message parity, and 37-route production build.
- The protected Staging Maps key passed a real Partner-origin Places probe and all three frontend builds.

Staging deployment proof:

- Staging-specific SMTP values were installed outside source control with `EMAIL_ENABLED=true`; provider verification and real transactional sends passed.
- A pre-deployment PostgreSQL backup was captured, all 115 migrations were current, and a rollback overlay was prepared before service replacement.
- API, Partner, Superadmin, and Customer run immutable revision-labelled, non-root images. All are healthy with zero restarts.
- PostgreSQL and Customer were not recreated during the final API/admin contract deployment.
- Local and public API/Partner/Superadmin/Customer smoke checks passed three consecutive rounds.
- Live staff creation returned invitation delivery metadata and sent the invitation; live Customer registration stored and resent a verification OTP. Temporary QA data was removed.

Remaining acceptance: confirm issue 2 through the authenticated Global Settings UI and issue 4 with a deliberately stale authenticated Partner session. Production remains unchanged.

## Batch 2 Fix Record — Issues 6–9 + Custom-domain UX

Status: deployed to Staging on 16 September 2026. Guest favorites and stored guest-name display are live verified; final cart-error, footer, and authenticated custom-domain interaction checks remain.

| Application | Commit    | Covered work                                                                                                                                              |
| ----------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer    | `a97be47` | Guest favorite restrictions, stored guest-name display, commit-only add-to-cart success feedback, and aligned desktop footer columns.                     |
| Superadmin  | `636bcc0` | Shared hostname-only custom-domain validation and bilingual field guidance for Create Business and Create Restaurant, matching the existing API contract. |

Verification completed before push:

- Customer: lint, TypeScript, 83 test files / 590 tests, and 37-route production build.
- Superadmin: lint with zero errors and one inherited warning, TypeScript, 10 test files / 25 tests, 1,839-key bilingual message parity, and 34-route production build.
- Focused hostname tests accept blank, valid, uppercase, and trailing-dot hostnames and reject protocol, path, port, localhost, and invalid-label inputs.

The cumulative release deployed immutable non-root Customer `cbd4920` and Superadmin `636bcc0` images with exact revision labels. Protected Staging configuration was verified in both frontend builds, ancestry passed, and rollback images are recorded. Live guest acceptance confirmed the supplied name, hidden favorites navigation, zero favorites API calls, required-name validation, no overflow, and cleanup of temporary QA data. Final cart-error, footer, and authenticated custom-domain interaction checks remain. Production remains unchanged.

## Requirement and UX Gaps

| Area                       | Valid gap                                                                                                                                                 | Decision / status                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Superadmin custom domain   | Create Business and Create Restaurant do not provide matching client-side hostname validation/help before the API rejects protocol, path, or port values. | **Deployed to Staging; authenticated interaction acceptance pending.** Both forms provide matching bilingual hostname-only guidance and validation.                                                        |
| Restaurant-name uniqueness | Multiple active restaurants can share the same name.                                                                                                      | **Deployed to Staging; mutation acceptance pending.** New active duplicates are rejected case-insensitively within one tenant. Existing duplicates remain unchanged pending a separate data-cleanup decision. |
| Menu-item-name uniqueness  | Multiple active items can share the same name within one restaurant.                                                                                      | **Deployed to Staging; mutation acceptance pending.** New active duplicates are rejected case-insensitively within one restaurant; duplicate actions generate a unique copy name. Existing duplicates remain. |
| Guest name requirement     | The current guest contract permits an empty name.                                                                                                         | **Staging verified.** Interactive guest continuation requires a trimmed first name in both UI and API; technical cart guest sessions retain an explicit generic identity. Desktop/mobile UI and HTTP 400 API acceptance passed. |
| Customer Google login      | Google sign-in fails in the observed flow.                                                                                                                | **Deployed to Staging; valid-provider acceptance pending.** Verified Google identities are restaurant-scoped; live acceptance confirmed invalid tokens remain rejected.                                   |

## Batch 3 Fix Record — Remaining Five Issues

Status: deployed to Staging on 16 September 2026. Guest-name and favicon behavior are live verified; authenticated uniqueness and valid-provider Google acceptance remain.

| Application | Commit(s) | Covered work |
| --- | --- | --- |
| Platform API | `7331a1c`, `34f6bd2` | Tenant-scoped, case-insensitive active restaurant-name collision lookup and create/update validation. |
| Platform API | `7329155`, `85555b8` | Restaurant-scoped, case-insensitive active menu-item collision lookup and single, bulk, update, and duplicate-flow validation. |
| Platform API | `418ae05`, `8fa2625` | Required interactive guest first names and verified, restaurant-scoped Google customer sign-in/provisioning. |
| Customer | `4bb4e35`, `cbd4920` | Required localized guest-name input while preserving technical guest carts, plus a valid default favicon with runtime branding override preserved. |

Verification completed before delivery:

- Platform API: TypeScript, build, complete test suite, lint, and focused restaurant, menu-item, guest, and Google-auth regression suites.
- Customer: TypeScript, lint, complete Vitest suite, and the 38-route production build using protected Staging build configuration.
- `/favicon.ico` returned HTTP 200 from the production build and was identified as a valid Windows icon.
- Invalid or unverified Google tokens remain rejected; account lookup and creation are restricted to the selected restaurant and customer role.
- The Staging database audit found one existing restaurant-name collision and one existing menu-item-name collision. Neither was renamed, deleted, or otherwise mutated. Application guards prevent new collisions; a database unique index is intentionally deferred until existing data is reconciled.

The cumulative release deployed API `2ce7584` (including tracker/runtime target `b57287e`) and Customer `cbd4920`, together with Batch 2 Superadmin `636bcc0`. All target containers are healthy, non-root, and at zero restarts. PostgreSQL and Partner were not recreated. The verified pre-deployment backup is `/opt/feastflow/backups/staging/feastflow_staging_20260916T114713Z.dump`; all 115 migrations were current. Three localhost and three public smoke rounds passed, browser checks passed on desktop/mobile, and recent target-service logs contained no error markers. Production remains unchanged.

## Reports Not Accepted Into the Confirmed Backlog

- **Superadmin export:** the observed export request returned HTTP 200. The current UI supports CSV and client-generated PDF, not Excel. A browser recording or failed downloaded file is required to reproduce a defect.
- **Checkout total after item removal:** the observed delete returned HTTP 200 with a reduced cart, and the deployed frontend consumes that response to recalculate totals. An exact cart state or recording is required.
- **Global six-item cart maximum:** no global six-item constraint exists. The backend enforces each item's configured `maxQuantity`; the inspected Nauman items use a per-item maximum of five.

## Additional Open Items

| Area                  | Open item                                                                                                                                                          | Classification                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Staging modifier data | The `Extra Burger Toppings` group is linked to an item but contains no modifiers, so customer customization summaries can describe a group with no usable choices. | **Data/configuration issue.** Populate the group or unlink it from the item; this is not an API-fetch defect. |
| Customer favicon      | The customer favicon returns HTTP 404 on Staging.                                                                                                                  | **Staging verified.** `/favicon.ico` returns HTTP 200 with `image/x-icon` while the runtime branding override remains available. |

## Maintenance Rule

Add reported problems here only after recording their evidence and classification. For every implemented fix, record the affected application, commit, verification proof, and whether it is deployed. Do not mark an issue Staging or Production verified until it has been tested in that environment. Keep feature work, roadmap phases, and proactive improvements in `FEASTFLOW-UPDATES.md`.
