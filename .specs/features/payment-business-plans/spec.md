# Payment & Business Plans — Spec

## Goal
Allow Super Admin to create monetization plans that restaurants purchase. Plans can charge monthly/yearly fixed fees, per-order commission, or both, and include configurable business modules/features.

## Pricing Models
- `PLAN` / fixed: restaurant pays recurring fixed fee only.
- `COMMISSION`: restaurant pays a commission per order only.
- `HYBRID`: restaurant pays recurring fixed fee + per-order commission.

## Requirements
- PB-001 Super Admin can create, update, list, view, activate/deactivate, and soft-delete plans.
- PB-002 Plan fields: name, description, pricing model, billing interval, currency, fixed amount, commission percentage, commission cap amount, trial days, VAT percentage, payout cycle, terms document, features/modules.
- PB-003 Commission rules:
  - Fixed plan: fixed amount > 0, commission = 0, cap optional/ignored.
  - Commission plan: fixed amount = 0, commission percentage > 0, cap optional.
  - Hybrid plan: fixed amount > 0 and commission percentage > 0, cap optional.
- PB-004 Feature/module selection supports boolean inclusion plus optional limits per module.
- PB-005 Restaurants can purchase/subscribe to an active plan.
- PB-006 Restaurant can have one active subscription at tenant or restaurant scope; assigning a new one cancels previous active subscription in that same scope.
- PB-007 Subscription stores status, start/end, selected plan snapshot, payment status, next billing date, and notes.
- PB-008 Order settlement can compute platform commission from active subscription: min(order subtotal * percentage, cap amount if provided).
- PB-009 Public/business APIs expose current subscription and enabled modules for frontend gating.
- PB-010 All Super Admin management endpoints are protected by `SUPER_ADMIN` role.

## Existing Implementation Baseline
DeliveryWays already has `PackagePlan` and `TenantSubscription` with:
- `billingModel`: `COMMISSION | PLAN | HYBRID`
- `billingInterval`: `MONTHLY | YEARLY`
- `planPrice`, `commissionPercentage`, `currency`, `trialDays`, `features`, active/default flags
- Super Admin CRUD endpoints at `admin/package-plans`
- Super Admin subscription assignment endpoints at `admin/package-plans/subscriptions`

## Missing From Current Baseline
- Commission cap amount
- VAT percentage
- payout cycle
- terms document upload/reference
- formal feature/module catalog endpoint
- restaurant self-purchase/payment checkout flow
- plan snapshot on subscription
- commission settlement records per order
- business-facing current subscription endpoint
