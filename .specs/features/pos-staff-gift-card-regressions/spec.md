# POS, Staff Customer Access, and Gift Card Regression Specification

## Problem Statement

Restaurant staff still encounter static-role authorization failures despite assigned
Customer Management or POS permissions. POS/order presentation and storefront
localization also expose incorrect labels, and paid guest gift cards are fulfilled
without delivering the generated code to the intended recipient.

## Goals

- [x] Make staff customer access follow assigned module permissions and scope.
- [x] Correct the reported POS/order/modal/storefront presentation regressions.
- [x] Deliver fulfilled guest gift cards to an explicit recipient after Stripe confirmation.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Changing guest checkout behavior | POS customer lookup only needs registered customers. |
| Database schema changes | Existing payment provider metadata supports delivery state. |
| Sending gift cards before payment | Fulfillment must remain webhook-confirmed. |

## User Stories

### P1: Permission-scoped customer access

**User Story**: As restaurant staff, I want assigned customer or POS permissions to
authorize the related customer data so I can perform my job.

**Acceptance Criteria**:

1. WHEN staff has Customer Management access THEN the API SHALL authorize the
   matching customer operation within hydrated tenant/restaurant scope.
2. WHEN staff has POS read access THEN the API SHALL authorize customer list/detail
   reads required for POS selection without authorizing customer mutation.
3. WHEN staff lacks both permissions THEN the API SHALL continue returning forbidden.

**Independent Test**: Guard and service tests prove allow/deny access keys, read-only
POS access, and restaurant-scoped customer operations.

### P1: Recipient gift-card delivery

**User Story**: As a buyer, I want the paid gift card sent to my chosen recipient so
the recipient receives the redeemable code and message.

**Acceptance Criteria**:

1. WHEN a guest submits a purchase THEN the system SHALL require and persist a
   recipient email separately from buyer email.
2. WHEN Stripe confirms payment THEN the system SHALL create the gift card before
   emailing its code, value, expiry, buyer identity, and message to the recipient.
3. WHEN email delivery fails after fulfillment THEN a retried webhook SHALL retry
   delivery without creating another gift card.

**Independent Test**: Payments tests prove first fulfillment, email delivery, delivery
state persistence, and paid-payment retry behavior.

### P1: Correct POS and order presentation

**Acceptance Criteria**:

1. WHEN POS shows scheduled time THEN the control SHALL request 24-hour presentation.
2. WHEN an admin-created order is DINE_IN THEN the Address column SHALL show Dine in,
   never Takeaway Order.
3. WHEN the permission dialog exceeds available height THEN it SHALL remain bounded
   and scroll internally.

### P1: German closed status

**Acceptance Criteria**:

1. WHEN the storefront locale is German and an hours summary is closed THEN the
   visible summary SHALL show `Geschlossen`, not `Closed`.

## Requirement Traceability

| Requirement ID | Requirement | Status |
| --- | --- | --- |
| STAFF-01 | Customer Management operations | Verified |
| STAFF-02 | POS customer read access | Verified |
| POS-01 | 24-hour scheduled time | Verified |
| ORDER-01 | Dine-in address label | Verified |
| UI-01 | Bounded scrolling permission dialog | Verified |
| I18N-01 | German closed summary | Verified |
| GIFT-01 | Separate recipient email | Verified |
| GIFT-02 | Webhook email fulfillment | Verified |
| GIFT-03 | Idempotent email retry | Verified |

## Success Criteria

- [x] All requirement-focused tests pass.
- [x] Backend, Restaurant Admin, and Customer full verification passes.
- [x] No tenant/restaurant scope widening and no migration.

## Verification

- Backend: 82 suites / 989 tests; build, typecheck, lint, and Prisma validation passed.
- Restaurant Admin: 79 files / 457 tests; build, typecheck, lint, imports, and i18n passed.
- Customer: 75 files / 520 tests; build, typecheck, lint, and EN/DE key parity passed.
- Repository-wide NestJS verifier still reports 60 pre-existing architectural findings;
  touched-file review introduced no new tenant guard or Prisma access pattern.
