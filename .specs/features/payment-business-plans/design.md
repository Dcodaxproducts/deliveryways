# Payment & Business Plans — Backend Design

## Recommended Module Boundary
Keep the existing `package-plans` module as Super Admin plan management. Add a business-facing `business-subscriptions` or extend package-plans with restaurant-safe read/purchase endpoints.

Suggested bounded contexts:
1. `package-plans`: plan catalog and Super Admin assignment.
2. `business-subscriptions`: restaurant purchase/current subscription, billing lifecycle.
3. `billing-ledger` later: invoices, settlement, payouts, commission deductions.

## Data Model Additions
Extend `PackagePlan`:
- `commissionCapAmount Decimal? @map("commission_cap_amount") @db.Decimal(10,2)`
- `vatPercentage Decimal @default(0) @map("vat_percentage") @db.Decimal(5,2)`
- `payoutCycle PackagePayoutCycle @default(WEEKLY) @map("payout_cycle")`
- `termsDocumentUrl String? @map("terms_document_url")`
- `featureCodes String[]` is not portable in Prisma/Postgres? Prefer JSON feature object already present.

Add enum:
- `PackagePayoutCycle`: `DAILY | WEEKLY | BIWEEKLY | MONTHLY`

Extend `TenantSubscription`:
- `planSnapshot Json? @map("plan_snapshot")` to preserve purchased pricing/features even if plan changes later.
- `paymentStatus PaymentStatus @default(PENDING) @map("payment_status")`
- `nextBillingAt DateTime? @map("next_billing_at")`

Later ledger models:
- `PlatformInvoice`: subscription recurring invoices.
- `OrderCommission`: per-order commission calculation and cap application.
- `RestaurantPayout`: payout cycle aggregation.

## Feature JSON Shape
Use a stable JSON object so FE can render checkboxes and limits without schema churn:

```json
{
  "modules": {
    "ORDER_MANAGEMENT": { "enabled": true },
    "MENU_MANAGEMENT": { "enabled": true },
    "BRANCH_MANAGEMENT": { "enabled": true, "limit": 3 },
    "REPORTS_ANALYTICS": { "enabled": false },
    "PRIORITY_SUPPORT": { "enabled": true }
  }
}
```

## API Contract
Existing Super Admin endpoints remain:
- `POST /admin/package-plans`
- `GET /admin/package-plans`
- `GET /admin/package-plans/:id`
- `PATCH /admin/package-plans/:id`
- `DELETE /admin/package-plans/:id`
- `POST /admin/package-plans/subscriptions`
- `GET /admin/package-plans/subscriptions`
- `PATCH /admin/package-plans/subscriptions/:id`

Enhance create/update body:
```json
{
  "name": "Growth Plan",
  "description": "For growing restaurants",
  "billingModel": "HYBRID",
  "billingInterval": "MONTHLY",
  "planPrice": 5000,
  "commissionPercentage": 5,
  "commissionCapAmount": 250,
  "vatPercentage": 15,
  "payoutCycle": "WEEKLY",
  "currency": "PKR",
  "trialDays": 14,
  "termsDocumentUrl": "storage/key.pdf",
  "features": {
    "modules": {
      "ORDER_MANAGEMENT": { "enabled": true },
      "PRIORITY_SUPPORT": { "enabled": true }
    }
  }
}
```

Add business-facing endpoints:
- `GET /business/package-plans` — restaurant/admin can view active plans.
- `POST /business/subscription/purchase` — restaurant purchases an active plan.
- `GET /business/subscription/current` — current plan, features, billing state.
- `POST /business/subscription/cancel` — cancel at period end or immediately, depending policy.

## Commission Formula
For a completed order:
1. Resolve active subscription for restaurant, fallback tenant-wide subscription.
2. If model is `PLAN`, commission = 0.
3. If `COMMISSION` or `HYBRID`, raw commission = eligible order amount * percentage / 100.
4. If `commissionCapAmount` exists, commission = min(raw commission, cap).
5. VAT can be applied on platform fee depending finance rule.

## Implementation Order
1. Schema + DTO enhancements for cap/VAT/payout/terms/snapshot/payment status.
2. Extend existing Super Admin package-plan create/update validation.
3. Add feature catalog constants endpoint.
4. Add business-facing plan list/current subscription endpoints.
5. Add purchase flow skeleton with payment method support.
6. Add order commission calculator service and tests.
7. Add invoice/payout ledger in a second phase if needed.
