# Localized Customer Email Templates Tasks

**Status**: Completed

## Execution Plan

### T1: Global template contract

- Add typed defaults, DTO validation, merge/extract behavior, and settings tests.
- Verify unsupported variables are rejected and legacy settings gain defaults.

### T2: Transactional renderer

- Add locale resolution and safe placeholder rendering in the mailer module.
- Verify German, English, fallback, and customized templates.

### T3: Auth and profile locale

- Capture request locale for verification/reset mail.
- Persist customer locale in profile metadata through registration/profile sync.
- Verify non-customer profile updates remain unchanged.

### T4: Order/payment/gift-card localization

- Route customer notification and gift-card mail through the renderer.
- Include full order detail variables and order items.
- Verify German defaults and English saved-locale behavior.

### T5: Super Admin editor

- Extend Notification Settings types, normalization, form, translations, and
  tests with six DE/EN template editors and variable guidance.

### T6: Customer locale sync

- Sync authenticated non-guest locale changes through the profile endpoint.
- Verify persistence requests and avoid loops/redundant writes.

### T7: Restaurant Admin login copy

- Replace the three-part marketing sentence with localized welcome text.
- Verify both locale catalogs and rendered component.

### T8: Full verification and release

- Run focused and full tests, typechecks, builds, lint, Prisma, imports, and i18n.
- Commit and push Backend, Super Admin, Customer, and Restaurant Admin.

## Pre-Implementation

- **Assumptions**: Super Admin owns platform templates; supported customer
  locales are `de` and `en`; plaintext templates satisfy “email formats.”
- **Files to touch**: only global settings, mailer/auth/notifications/payments,
  their tests, Super Admin notification settings, Customer locale provider/API,
  and Restaurant Admin login/messages.
- **Success criteria**: all requirements have automated regression coverage,
  four repositories pass their standard verification, and no migration exists.
