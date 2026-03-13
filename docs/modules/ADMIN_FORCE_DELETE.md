# Admin Force Delete APIs — DeliveryWays

## Purpose
Adds **instant hard-delete endpoints** for admin workflows, with strict safety blockers.

These endpoints are intentionally conservative:
- they hard-delete only when no dependent records exist
- otherwise they return a blocker summary

---

## Endpoints

### Tenant force delete
`DELETE /api/v1/tenants/:id/force`

Role:
- `SUPER_ADMIN`

Behavior:
- checks related counts (`restaurants`, `branches`, `users`, `orders`, `coupons`, `transactions`)
- rejects if any count > 0
- hard-deletes tenant only when clean

### Restaurant force delete
`DELETE /api/v1/restaurants/:id/force`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN` (own restaurant only)

Behavior:
- checks related counts (`branches`, `users`, `menu*`, `inventory*`, `coupons`, `orders`, `transactions`)
- rejects if any count > 0
- hard-deletes restaurant only when clean

### Branch force delete
`DELETE /api/v1/branches/:id/force`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN` (same restaurant scope)

Behavior:
- checks related counts (`users`, overrides, movements, `coupons`, `orders`, `transactions`)
- rejects if any count > 0
- deletes branch address rows (`refType=BRANCH`) then hard-deletes branch

---

## Error Pattern
When blocked, API returns a `400` payload with:
- top-level message
- `blockers[]` entries containing `{ resource, count }`

This gives admin clear actionability before retrying force delete.

---

## Why this approach
- preserves audit-critical data (orders/payments/coupons/users)
- avoids accidental destructive cascades
- still supports instant cleanup for truly empty records
