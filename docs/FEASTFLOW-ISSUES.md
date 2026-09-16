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

| # | Area | Valid issue | Evidence / scope | Current status |
|---:|---|---|---|---|
| 1 | Cross-app maps and addresses | Maps, Places autocomplete, current-location lookup, and reverse geocoding fail across Superadmin Brand Owner addresses, Partner branch creation, Storefront location selection, and Checkout address selection. Some searches remain loading and maps can render blank. | The deployed frontends contain an older Google key. The current protected Staging key succeeds from the Partner Staging origin with `PlacesServiceStatus.OK`. This consolidates Superadmin #1, Partner #3–4, and Restaurant Domain #1–2 and #5–7 under one configuration/build issue. | **Fixed in source / pending Staging deployment.** Partner, Superadmin, and Customer builds pass with the protected Staging key. A coordinated rebuild/redeploy is required; no new key is needed. |
| 2 | Superadmin global settings | Saving an empty or invalid primary/secondary color exposes a raw regular-expression validator message. | Live PATCH returned HTTP 400 with technical class-validator output. | **Fixed in source / pending Staging deployment.** Blank colors now clear correctly; malformed nonblank colors return readable field-specific messages. |
| 3 | Superadmin employee onboarding | Newly created employees do not receive an invitation email. | The previous staff-create workflow created credentials without sending an invitation. Staging email delivery is also disabled. | **Fixed in source + configuration required.** The API now sends an invitation when email is enabled and returns `invitationEmailSent`; Partner and Superadmin warn when delivery is unavailable. Staging SMTP configuration and deployment are still required for real delivery. |
| 4 | Partner restaurant context | Dashboard and category requests can use a stale unauthorized restaurant selection and return load/network errors. | Tester traffic used restaurant `cmtvc82...` and received HTTP 403; selecting authorized restaurant `cmu28s1...` restored HTTP 200/201 behavior. | **Fixed in source / pending Staging deployment.** Partner now clears persisted Business Admin restaurant/branch state before scoped requests run. |
| 5 | Customer signup OTP | Storefront registration advances to OTP verification, but no OTP email arrives. | Staging runs in production mode with `EMAIL_ENABLED=false` and no SMTP credentials. The API therefore auto-verifies registrations and creates no OTP, while the previous Customer UI always opened the OTP screen. Read-only database proof found 3 non-guest Customer accounts, all verified, with 0 stored verification OTPs. | **Frontend fixed in source + configuration required.** Customer commit `1f5931a` handles `isVerified` and `verificationEmailSent`, exposes resend after delivery failure, and supplies the required OTP purpose. Real OTP delivery still requires Staging SMTP configuration, API deployment/restart, and end-to-end verification. |
| 6 | Guest favorites | Restaurant and menu-item favorite controls are visible to guest users. | Guest sessions receive tokens, while favorite visibility checks only for token presence. Restaurant Domain #4 and #11 are duplicate symptoms. | **Confirmed / not yet fixed.** |
| 7 | Guest profile name | A supplied guest name is stored, but the storefront profile displays `User`. | The navbar intentionally substitutes the generic label for guest accounts instead of rendering the stored name. | **Confirmed / not yet fixed.** |
| 8 | Customer cart feedback | A rejected add-to-cart request can display both an incorrect success toast and the limit error. | The optimistic handler emits success before the API response, then rolls back and emits an error after HTTP 400. | **Confirmed / not yet fixed.** |
| 9 | Storefront footer | The leftmost desktop footer column is misaligned relative to the remaining columns. | The footer columns use asymmetric desktop padding. | **Confirmed / not yet fixed.** |

## Batch 1 Fix Record — Issues 1–5

Status: implemented, verified, and pushed; not deployed to Staging.

| Application | Commit | Covered work |
|---|---|---|
| Platform API | `0291eab` | Readable global-settings color validation and employee invitation delivery contract. |
| Partner | `617c524` | Invitation-delivery feedback and stale restaurant/branch context clearing. |
| Superadmin | `eb8e806` | Invitation-delivery feedback. |
| Customer | `1f5931a` | Signup/OTP result handling, resend recovery, and required OTP purpose. |

Verification completed before push:

- Platform API: TypeScript, build, lint, and 106 suites / 1,213 tests.
- Partner: lint, TypeScript, 114 suites / 1,039 tests, internationalization/import/UI guards, and 65-route build.
- Superadmin: lint, TypeScript, message parity, and build.
- Customer OTP follow-up: lint, TypeScript, 83 files / 588 tests, bilingual message parity, and 37-route production build.
- The current protected Staging Maps key passed a real Partner-origin Places probe and all three frontend builds.

Remaining before these fixes can be marked Staging verified:

1. Configure Staging-specific `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_ENCRYPTION`, and `MAIL_FROM_ADDRESS` values, then set `EMAIL_ENABLED=true`.
2. Build and deploy the cumulative API, Partner, Superadmin, and Customer Staging releases with ancestry, rollback, and service-isolation checks.
3. Verify Maps/Places, blank and invalid color handling, staff invitations, stale restaurant context, customer signup, OTP verification, and resend OTP end to end.

Production SMTP secrets must not be copied into Staging without explicit approval, and credentials must never be committed to Git or shared in chat.

## Valid Requirement and UX Gaps Requiring Approval

| Area | Valid gap | Decision required |
|---|---|---|
| Superadmin custom domain | Create Business and Create Restaurant do not provide matching client-side hostname validation/help before the API rejects protocol, path, or port values. | Keep the backend hostname-only contract and add clear field guidance/validation. Superadmin reports #2 and #3 are the same gap. Blank and valid hostname-only values are accepted. |
| Restaurant-name uniqueness | Multiple active restaurants can share the same name. | Define uniqueness scope before changing schema/API behavior. Recommended: tenant-scoped rather than global uniqueness. |
| Menu-item-name uniqueness | Multiple active items can share the same name within one restaurant. | Define whether uniqueness is restaurant-scoped or restaurant/category-scoped before changing schema/API behavior. |
| Guest name requirement | The current guest contract permits an empty name. | Decide whether guest name becomes required. This is a behavior change, separate from the confirmed profile-display defect. |
| Customer Google login | Google sign-in fails in the observed flow. | The broker route/assets returned 404 and `google-login` returned 401, but existing-account linkage cannot be confirmed without the exact email and restaurant because customer accounts are restaurant-scoped. |

## Reports Not Accepted Into the Confirmed Backlog

- **Superadmin export:** the observed export request returned HTTP 200. The current UI supports CSV and client-generated PDF, not Excel. A browser recording or failed downloaded file is required to reproduce a defect.
- **Checkout total after item removal:** the observed delete returned HTTP 200 with a reduced cart, and the deployed frontend consumes that response to recalculate totals. An exact cart state or recording is required.
- **Global six-item cart maximum:** no global six-item constraint exists. The backend enforces each item's configured `maxQuantity`; the inspected Nauman items use a per-item maximum of five.

## Additional Open Items

| Area | Open item | Classification |
|---|---|---|
| Staging modifier data | The `Extra Burger Toppings` group is linked to an item but contains no modifiers, so customer customization summaries can describe a group with no usable choices. | **Data/configuration issue.** Populate the group or unlink it from the item; this is not an API-fetch defect. |
| Customer favicon | The customer favicon returns HTTP 404 on Staging. | **Confirmed minor issue / not yet fixed.** |

## Maintenance Rule

Add reported problems here only after recording their evidence and classification. For every implemented fix, record the affected application, commit, verification proof, and whether it is deployed. Do not mark an issue Staging or Production verified until it has been tested in that environment. Keep feature work, roadmap phases, and proactive improvements in `FEASTFLOW-UPDATES.md`.
