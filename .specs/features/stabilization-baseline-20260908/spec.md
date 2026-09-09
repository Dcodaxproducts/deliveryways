# FeastFlow stabilization baseline

Status: approved for documentation and Git-reference work only

Date: 2026-09-08

Scope: release safety and critical-flow mapping

## Objective

Freeze a verifiable description of the currently working FeastFlow platform before optimization or UI work starts. The baseline must make regressions, omitted release commits, unsafe rollbacks, and accidental domain ownership changes detectable.

## Requirements

### Release safety

- **STAB-01** Record the exact Production and Staging application image tags and the source commits they represent.
- **STAB-02** Prove that every Production commit contains its repository's current `origin/main` history.
- **STAB-03** Record immutable runtime image IDs, release manifests, database backups, and rollback entry points.
- **STAB-04** Establish permanent, non-rewritten `release/staging` and `release/production` references plus immutable Production tags.
- **STAB-05** Define a promotion policy that deploys the same verified commit through environments and rejects non-cumulative releases.
- **STAB-06** Preserve the platform routing boundary: FeastFlow must never claim `feastflow.co` or `www.feastflow.co`; it may serve API, Partner, Superadmin, and restaurant-slug subdomains. Existing `demo` and `flutterweb` hosts remain untouched.

### Flow protection

- **FLOW-01** Map authentication, session refresh, logout, password recovery, and role-specific login paths.
- **FLOW-02** Map tenant onboarding, owner creation, subscription creation, and Superadmin approval.
- **FLOW-03** Map restaurant and branch creation, editing, activation, operating hours, and branch scoping.
- **FLOW-04** Map menu, category, item, variation, modifier, and restaurant-menu management.
- **FLOW-05** Map cart, quote, fulfillment, coupon, pricing, tax, delivery-fee, and checkout behavior.
- **FLOW-06** Map order creation, lifecycle transitions, cancellation, tracking, and realtime delivery.
- **FLOW-07** Map payment attempts, provider callbacks/webhooks, reconciliation, refunds, wallets, and payouts.
- **FLOW-08** Map staff roles, permissions, tenant isolation, restaurant isolation, and branch isolation.
- **FLOW-09** Map reports, invoices, subscriptions, package plans, settings, and administrative operations.
- **FLOW-10** For every critical flow, record UI entry points, API surface, actors, persistent effects, invariants, current automated coverage, and missing acceptance coverage.

## Non-goals

- No application-code refactor or optimization.
- No schema or migration change.
- No database, container, environment-file, DNS, Nginx, Plesk, or Production mutation.
- No API contract or UI behavior change.
- No automated write test against Production.

## Safety gates

Work stops for explicit review if a proposed change would alter an API response, authorization result, tenant scope, order total, payment state, database schema, or public-domain ownership.

## Acceptance criteria

1. Exact deployed releases and rollback artifacts are recorded with reproducible evidence.
2. The current Production commits are immutable-tagged and have protected release pointers.
3. Staging and Production divergence is disclosed, including patch-equivalent history.
4. The critical-flow matrix covers all business-critical surfaces and states the invariant each must preserve.
5. Test gaps are ranked, with Superadmin and cross-application acceptance coverage clearly identified.
6. Repository verification passes and the documentation is committed and pushed without a deployment.
