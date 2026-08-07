# POS and Storefront Follow-up Tasks

**Design**: .specs/features/pos-receipt-ux-followup/design.md
**Status**: Complete

## Assumptions

- The screenshots are from the currently deployed cumulative release.
- The configured 58 or 80 mm printer speaks ESC/POS; A4 and A5 printers continue using pixel HTML.
- Instant means no saved scheduled timestamp: orderTime null.
- House number maps to the backend's existing houseNumber field, not legacy area.

## Execution Plan

### T1: Fix customer selector request lifecycle

**Status**: Complete

- **Files**: Restaurant Admin AsyncSelect.tsx plus test.
- **Requirement**: POSUX-01
- **Done when**: reset or search always loads page 1 once; load-more cannot supersede it with an empty page.

### T2: Preserve POS form state and add timing or address controls

**Status**: Complete

- **Files**: Restaurant Admin PosCart.tsx, pos-checkout-payload.ts, tests, translations, POS selection event type.
- **Requirements**: POSUX-02, POSUX-03, POSUX-04
- **Done when**: first add preserves form state; instant clears time; scheduled requires time; house number is submitted.

### T3: Make receipts reliable and reusable

**Status**: Complete

- **Files**: Restaurant Admin order-ticket and local-printer helpers and tests, POS cart, Orders table, translations.
- **Requirements**: PRINT-01, PRINT-02, PRINT-03
- **Done when**: thermal output is raw ESC/POS; POS and order list can print; feedback is receipt-specific.

### T4: Improve item dialogs

**Status**: Complete

- **Files**: Restaurant Admin POS add-item modal; Customer item dialog.
- **Requirement**: CART-01
- **Done when**: modal body scrolls independently and the add action stays visible; POS hero and spacing are more compact.

### T5: Add compact cart mutation response

**Status**: Complete

- **Files**: Backend cart DTO, controller, service and tests; Admin and customer cart callers and tests.
- **Requirement**: CART-02
- **Done when**: compact=true performs full validation and mutation but skips full cart response or quote; all direct item-add flows use it.

### T6: Fix generic email greeting

**Status**: Complete

- **Files**: Backend notifications service and tests.
- **Requirement**: EMAIL-01
- **Done when**: walk-in or guest uses Customer or Kunde; named registered customers remain unchanged.

### T7: Fix narrow mobile tip controls

**Status**: Complete

- **Files**: Customer cart summary and test.
- **Requirement**: MOBILE-01
- **Done when**: icon-only apply or update action is used on narrow screens with an accessible label and no overflow.

### T8: Full verification and release

**Status**: Complete

- Run per-file NestJS enforcement for backend changes.
- Run full type, build, test, lint, import, and i18n checks in all affected repositories.
- Review diff, commit by repository concern, push the shared branch, and record durable handoff.
