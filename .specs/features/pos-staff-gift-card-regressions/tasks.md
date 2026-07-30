# POS, Staff Customer Access, and Gift Card Regression Tasks

**Status**: Verified

## Task Breakdown

### T1: Map customer routes to staff permissions

**Requirement**: STAFF-01, STAFF-02
**Done when**: RolesGuard and controller tests prove Customer Management operations,
POS read-only access, and forbidden unrelated access.

### T2: Preserve customer record scope for staff

**Requirement**: STAFF-01
**Depends on**: T1
**Done when**: service tests prove tenant/restaurant-scoped list/detail/mutation.

### T3: Correct POS scheduled time and order address labels

**Requirement**: POS-01, ORDER-01
**Done when**: component/utility tests prove 24-hour input metadata and DINE_IN label.

### T4: Bound and scroll the role permission dialog

**Requirement**: UI-01
**Done when**: component test proves fixed viewport-bounded height and scrolling.

### T5: Localize closed storefront summaries

**Requirement**: I18N-01
**Done when**: utility/component test proves German render uses the translation key.

### T6: Add recipient gift-card contract

**Requirement**: GIFT-01
**Done when**: backend DTO and customer validation/payload tests require and transmit
recipient email.

### T7: Deliver fulfilled gift card email idempotently

**Requirement**: GIFT-02, GIFT-03
**Depends on**: T6
**Done when**: payment tests prove first delivery and retry-after-fulfillment without
duplicate card creation.

### T8: Full verification and release

**Depends on**: T1-T7
**Done when**: project verification passes, each repository has an atomic conventional
commit, and all commits are pushed.

## Completion

- [x] T1: Customer Management and POS read mappings verified.
- [x] T2: Customer list/detail/mutation restaurant scope verified.
- [x] T3: 24-hour input metadata and DINE_IN label verified.
- [x] T4: Permission dialog bounded scrolling verified.
- [x] T5: German closed summary verified.
- [x] T6: Separate recipient contract verified.
- [x] T7: Webhook-confirmed, idempotent gift-card email delivery verified.
- [x] T8: Full verification complete; commit and push performed as the final step.
