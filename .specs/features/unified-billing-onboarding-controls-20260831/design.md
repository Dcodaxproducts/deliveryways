# Unified billing, deferred onboarding payment, and storefront control design

**Spec:** `spec.md`

## Approach

1. Extend the existing Restaurant Admin branding schema/default/form with `app.showAppPromotion`. The Customer app already normalizes that field and defaults it to `true`, so no new persistence model is required.
2. Keep package selection and subscription creation in `AuthService`, but replace the immediate-payment decision with deferred billing. Paid plans start ACTIVE with PENDING payment; trials remain TRIALING; free/commission-only plans may remain PAID. The response always reports `paymentRequiredNow=false`.
3. Remove Landing's registration-success branch to `/package-payment`; preserve email OTP and authenticated continuation.
4. Add a tenant-scoped repository query for payout requests whose request/review/payment event touches the subscription service period. Normalize them into a `payoutActivity` snapshot embedded in the subscription invoice.
5. Render payout activity as its own subscription PDF section. It is informational and not part of `amountDue`, because paid payouts already debit the restaurant wallet.
6. Stop calling the standalone payout automation from the hourly scheduler and stop persisting a special payout invoice when a request is marked paid. Keep legacy payout build/read/PDF code for existing audit records and compatibility.
7. Remove active standalone-payout navigation/queries from Restaurant Admin and Superadmin while keeping generated historical data backward compatible at the API layer.

## Payout activity period rule

A payout request belongs to a subscription document when at least one of `createdAt`, `approvedAt`, `rejectedAt`, or `paidAt` falls in `[servicePeriod.from, servicePeriod.to)`. Each request appears once with its current status and event timestamps. Summary amounts count request amounts by the event occurring in that period, preventing informational totals from being duplicated inside one document.

## Compatibility

- Stored subscription snapshots predating `payoutActivity` hydrate with an empty activity object before PDF generation.
- `GeneratedInvoiceKind.WEEKLY_PAYOUT` and its direct read/download support remain to preserve historic documents.
- No destructive data migration is required.

