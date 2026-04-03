# POS Module Spec

## Scope
Implement POS draft management for walk-in/counter/dine-in customers without conflicting with cart, group-order, or customer-app flows.

## V1 slice in progress
- POS-001 Separate `pos` API/module
- POS-005 Internal roles only
- POS-014 Support `TAKEAWAY` + `DINE_IN` only
- POS-017 Dedicated draft lifecycle
- POS-040..049 Draft CRUD API surface

## Current implementation slice
- Prisma models for POS drafts + draft items
- create/list/details/update/cancel draft endpoints
- branch/tenant/restaurant scope enforcement
- guest/existing-customer draft header support

## Deferred
- item endpoints
- quote
- checkout
- guest-user materialization into final order
- payment transaction creation
