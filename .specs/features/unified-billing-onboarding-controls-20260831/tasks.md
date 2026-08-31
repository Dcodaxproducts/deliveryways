# Unified billing, deferred onboarding payment, and storefront control tasks

## API

- [x] T1 (UB31-03, UB31-04): defer registration payment while preserving package assignment and unpaid status; add auth regression tests.
- [x] T2 (UB31-07, UB31-08): query period payout activity and embed it in subscription invoice snapshots/PDFs with tests.
- [x] T3 (UB31-06, UB31-09): stop new scheduled/special payout invoice generation while preserving payout request/wallet behavior.
- [x] T4 (UB31-10): preserve legacy stored payout PDF/read compatibility.

## Restaurant Admin / Customer

- [x] T5 (UB31-01, UB31-02): add the app-promotion visibility switch to branding form schema/default/normalization and tests.
- [x] T6 (UB31-10): remove standalone payout invoice querying/presentation from active Reports billing history.
- [x] T7 (UB31-02): verify the existing Customer desktop/mobile render guard and legacy-visible fallback.

## Landing / Superadmin

- [x] T8 (UB31-05): continue registration through verification without package-payment redirection and update tests/copy.
- [x] T9 (UB31-10): remove standalone payout navigation/actions from current Superadmin invoicing while retaining legacy generated record compatibility.
- [x] T10 (UB31-07): render unified payout activity in subscription invoice detail where applicable.

## Verification

- [x] T11: run per-file checks and focused tests after each slice.
- [x] T12: no new migration was added; the cumulative prior migration remains covered by its existing verification.
- [x] T13: run full lint, typecheck, tests, i18n parity, and production builds for every changed repository.
- [x] T14: commit and push cumulative branches without deploying.
