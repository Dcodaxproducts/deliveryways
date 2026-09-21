# FeastFlow Admin, Automation, Promotions, and Landing Design

**Spec:** `spec.md`

## Architecture

- Branch repository resolves the canonical manager, with an active BRANCH_ADMIN-by-branch fallback for legacy rows. The UI consumes only API-owned branch-admin data.
- Orders service owns auto-accept and reuses the existing status-transition side effects after creation/payment finalization.
- Coupon persists an optional `allowedOrderTypes` PostgreSQL enum array. DTOs, admin forms, public responses, and every checkout eligibility path use the same field.
- Global settings remains the single landing-content source. The landing provider consumes its existing `home` contract; individual sections render managed values and visibility.
- PackagePlan gains `showOnLanding`. The public endpoint filters by it, while authenticated Superadmin CRUD controls it.

## Compatibility

- `allowedOrderTypes` defaults to all three order types.
- `showOnLanding` defaults to false so public package exposure becomes explicit.
- Existing branch and order authorization remains unchanged.
- No hard-coded content fallback is used on the public landing page.

## Failure Handling

- Missing branch admin renders blank fields.
- Auto-accept errors do not create a second order; transaction/status transition tests protect idempotency.
- Landing fetch failure renders only structural chrome and managed-empty states.
