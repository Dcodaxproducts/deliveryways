# Unified billing, deferred onboarding payment, and storefront control tasks

## API

- [ ] T1 (UB31-03, UB31-04): defer registration payment while preserving package assignment and unpaid status; add auth regression tests.
- [ ] T2 (UB31-07, UB31-08): query period payout activity and embed it in subscription invoice snapshots/PDFs with tests.
- [ ] T3 (UB31-06, UB31-09): stop new scheduled/special payout invoice generation while preserving payout request/wallet behavior.
- [ ] T4 (UB31-10): preserve legacy stored payout PDF/read compatibility.

## Restaurant Admin / Customer

- [ ] T5 (UB31-01, UB31-02): add the app-promotion visibility switch to branding form schema/default/normalization and tests.
- [ ] T6 (UB31-10): remove standalone payout invoice querying/presentation from active Reports billing history.
- [ ] T7 (UB31-02): verify the existing Customer desktop/mobile render guard and legacy-visible fallback.

## Landing / Superadmin

- [ ] T8 (UB31-05): continue registration through verification without package-payment redirection and update tests/copy.
- [ ] T9 (UB31-10): remove standalone payout navigation/actions from current Superadmin invoicing while retaining legacy generated record compatibility.
- [ ] T10 (UB31-07): render unified payout activity in subscription invoice detail where applicable.

## Verification

- [ ] T11: run per-file checks and focused tests after each slice.
- [ ] T12: verify any migration set against a backed-up disposable PostgreSQL database.
- [ ] T13: run full lint, typecheck, tests, i18n parity, and production builds for every changed repository.
- [ ] T14: commit and push cumulative branches without deploying.
