# Unified billing, deferred onboarding payment, and storefront control specification

## Problem

DeliveryWay currently redirects some newly registered business owners to immediate package payment, exposes the customer homepage app-promotion banner without a Restaurant Admin visibility control, and creates separate subscription and payout invoices even though both documents describe the same restaurant billing period.

## Requirements

| ID | Acceptance criterion |
| --- | --- |
| UB31-01 | WHEN an authorized Business Admin edits storefront branding THEN Restaurant Admin SHALL expose a switch for the customer homepage app-promotion banner and persist it as `branding.app.showAppPromotion`. |
| UB31-02 | WHEN the storefront receives `showAppPromotion=false` THEN the banner SHALL not render on mobile or desktop; missing legacy values SHALL continue to mean visible. |
| UB31-03 | WHEN a public business owner registers with an active package THEN the package SHALL be assigned and restaurant access SHALL continue without requiring immediate payment. |
| UB31-04 | WHEN a non-free package is assigned at registration THEN its subscription SHALL remain ACTIVE/TRIALING as applicable, its unpaid state SHALL remain PENDING, and `paymentRequiredNow` SHALL be false. |
| UB31-05 | WHEN registration succeeds THEN Landing SHALL continue to email verification/dashboard onboarding and SHALL not redirect to the package-payment page. |
| UB31-06 | WHEN periodic invoice automation runs THEN it SHALL generate only subscription documents; it SHALL not create or email new standalone payout invoices. |
| UB31-07 | WHEN a subscription invoice is built THEN it SHALL retain its existing order, subscription fee, commission, adjustment, VAT, credit, and wallet-settlement details and SHALL additionally include payout-request activity touching the service period. |
| UB31-08 | WHEN payout activity is added to a subscription invoice THEN requested, approved, rejected, and paid details SHALL be informational and SHALL not change invoice amount due or double-count wallet debits. |
| UB31-09 | WHEN a payout request is completed THEN the request and wallet transaction SHALL remain authoritative; no standalone payout invoice SHALL be persisted. |
| UB31-10 | WHEN old standalone payout invoice records are requested directly THEN they SHALL remain readable/downloadable for audit, but current Admin navigation and normal history SHALL present subscription invoices as the active billing document. |

## Invariants

- Tenant, restaurant, and role scoping remain unchanged.
- Package assignment is mandatory at registration; only immediate collection is removed.
- No unpaid subscription is silently marked paid.
- Monetary values continue to use `Prisma.Decimal`; payout activity is display-only in invoice totals.
- Existing generated payout records are not deleted or rewritten.
- Existing storefronts default the app-promotion banner to visible when the setting is absent.

