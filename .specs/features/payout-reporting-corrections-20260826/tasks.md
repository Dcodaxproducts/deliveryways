# Payout and reporting corrections tasks

## API

- [ ] T1 (PR26-04): calculate COD from successful COD orders regardless of settlement status and add report regression tests.
- [ ] T2 (PR26-05, PR26-06, PR26-07, PR26-09): calculate all-method commission, restaurant-paid fees, VAT, and ledger-bounded available payout with refund/cap tests.
- [ ] T3 (PR26-08, PR26-10): expose the complete payout summary from wallet and invoice contracts and update tests.
- [ ] T4 (PR26-11): verify authorized employee total visibility and preserve permission boundaries.

## Restaurant Admin

- [ ] T5 (PR26-01): remove Order Management invoice history while preserving Reports billing history.
- [ ] T6 (PR26-02): add All/Registered/Guest customer filtering and request-contract tests.
- [ ] T7 (PR26-03): make Today's Orders the explicit default and recover legacy tabs.
- [ ] T8 (PR26-04, PR26-08): render correct COD and full payout breakdown with responsive translated cards.

## Super Admin

- [ ] T9 (PR26-08, PR26-09): display actual available payout plus the same deduction breakdown.

## Verification

- [ ] T10: run per-file enforcement and focused unit/component tests after each implementation slice.
- [ ] T11: run full typecheck, lint, test, and builds for API, Restaurant Admin, and Super Admin.
- [ ] T12: run role-aware browser acceptance for all seven screenshots, commit/push cumulative branches, and provide deployment-ready commits without deploying.
