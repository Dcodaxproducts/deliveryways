# Payment & Business Plans — Task Breakdown

## Phase 1: Complete Plan Management
- [ ] Add Prisma fields/enums for commission cap, VAT, payout cycle, terms document, subscription snapshot/payment state.
- [ ] Generate migration safely after DB backup plan.
- [ ] Update package-plan DTOs, service normalization, and validation.
- [ ] Update plan list/detail responses and tests.
- [ ] Add feature catalog endpoint/constants.

## Phase 2: Restaurant Purchase + Current Subscription
- [ ] Add business-facing routes for active plans and current subscription.
- [ ] Add purchase endpoint that creates subscription with plan snapshot.
- [ ] Integrate payment flow status if online payment is required immediately.
- [ ] Add subscription access helper for module gating.

## Phase 3: Commission + Billing Enforcement
- [ ] Add commission calculator service with cap logic.
- [ ] Hook commission calculation into order completion/payment settlement path.
- [ ] Store order commission records or invoice line items.
- [ ] Add VAT calculation rules.

## Phase 4: Payout/Invoice Ledger
- [ ] Add invoice and payout models.
- [ ] Generate billing cycle invoices.
- [ ] Aggregate commission deductions by payout cycle.
- [ ] Admin views for outstanding/paid/failed billing.

## Verification
- Unit specs for all three pricing models.
- Unit specs for cap amount and VAT.
- Unit specs for feature JSON preservation.
- Unit specs for one-active-subscription replacement behavior.
- Build, tsc, lint before commit.
