# Staff Nested Module Permissions Specification

## Problem Statement

Restaurant staff can see modules granted by their assigned role, but nested API
operations still fail in services that only recognize static admin roles or a
single token restaurant. This creates inconsistent Loyalty, Deliveryman,
Promotion, Content, and Payment experiences.

## Goals

- [x] Make each granted module authorize its matching nested operations.
- [x] Preserve tenant, restaurant, and branch assignment isolation.
- [x] Fix the reported Deliveryman, coupon, FAQ, and Payment Settings flows.

## Out of Scope

| Feature | Reason |
| --- | --- |
| New permission modules or operations | The existing registry contract is sufficient. |
| Database schema changes | Scope and FAQ data already exist. |
| Permission bypass for unassigned modules | Module and operation checks remain mandatory. |

## User Stories

### P1: Consistent nested module authorization

**User Story**: As restaurant staff, I want every nested action in an assigned
module to follow that module's operation permissions.

**Acceptance Criteria**:

1. WHEN staff has a module operation THEN the matching nested route SHALL pass
   the role guard.
2. WHEN staff lacks the required operation THEN the nested route SHALL remain
   forbidden.
3. WHEN a target is outside assigned restaurant/tenant scope THEN the service
   SHALL remain forbidden even if the operation is granted.

### P1: Loyalty and Deliveryman management

**Acceptance Criteria**:

1. WHEN Loyalty Program staff reads or updates the selected restaurant program
   THEN the service SHALL use the hydrated assigned restaurant scope.
2. WHEN Deliveryman staff opens the module THEN stats, list, detail, edit,
   status, delete, and assign-order actions SHALL use the Deliveryman module.
3. WHEN all-restaurants staff targets a deliveryman THEN the target SHALL still
   belong to the owner tenant.

### P1: Promotion, FAQ, and Payment Settings

**Acceptance Criteria**:

1. WHEN Promotion Management staff deletes a coupon in an assigned restaurant
   THEN deletion SHALL succeed; cross-scope deletion SHALL remain forbidden.
2. WHEN FAQ edit opens THEN the form SHALL prefill from the API `data.items`
   response.
3. WHEN Payment Settings staff opens the page THEN readable sections SHALL
   render, and update/create controls SHALL follow assigned operations.

## Requirement Traceability

| Requirement ID | Requirement | Status |
| --- | --- | --- |
| PERM-01 | Nested route operation mapping | Verified |
| LOYALTY-01 | Staff program read/update scope | Verified |
| DELIVERY-01 | Deliveryman stats module mapping | Verified |
| DELIVERY-02 | Deliveryman target scope | Verified |
| COUPON-01 | Scoped staff coupon deletion | Verified |
| FAQ-01 | FAQ edit prefill | Verified |
| PAYMENT-01 | Staff payment read/update/create | Verified |
| TENANT-01 | Cross-tenant/restaurant denial | Verified |

## Success Criteria

- [x] Focused allow/deny regressions pass.
- [x] Backend and Restaurant Admin full verification passes.
- [x] No migration and no scope widening outside assigned tenant/restaurants.
