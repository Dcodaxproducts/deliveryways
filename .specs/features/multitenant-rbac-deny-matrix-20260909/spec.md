# Multi-tenant and RBAC deny matrix

Status: Locally verified; CI pending

## Problem

FeastFlow has broad unit coverage for guards and scoped services, but it does not have one database-backed contract proving that authenticated actors cannot cross tenant, restaurant, branch, or staff-administration boundaries.

## Scope

This phase adds acceptance coverage only. It uses the existing disposable PostgreSQL P0 harness and the real NestJS HTTP pipeline. Application logic, API contracts, schema, migrations, and live environments are out of scope.

## P0 acceptance requirements

- **MT-RBAC-01 — Business tenant isolation:** WHEN a Business Admin reads or writes tenant, restaurant, branch, staff-role, or staff-account resources owned by another tenant, THEN the API SHALL return `403` and SHALL NOT mutate the foreign resource.
- **MT-RBAC-02 — Context spoofing denial:** WHEN a non-Superadmin supplies another tenant through `x-tenant-id`, request body, or query string, THEN the API SHALL return `403`.
- **MT-RBAC-03 — Branch Admin isolation:** WHEN a Branch Admin accesses another branch in the same restaurant or any resource in another tenant, THEN the API SHALL return `403`; the assigned branch SHALL remain readable and writable.
- **MT-RBAC-04 — Customer boundary:** WHEN a Customer accesses administrative restaurant or branch-write operations, or a branch belonging to another restaurant, THEN the API SHALL return `403`; active branches in the Customer's restaurant SHALL remain readable.
- **MT-RBAC-05 — Staff permission and assignment:** WHEN active Staff has branch read/update permission and one assigned branch, THEN only that branch SHALL be readable and writable; other same-tenant and foreign-tenant branches SHALL return `403`.
- **MT-RBAC-06 — Staff least privilege:** WHEN Staff has read-only branch permission, THEN a branch update SHALL return `403`.
- **MT-RBAC-07 — Immediate staff revocation:** WHEN a Staff account or assigned role becomes inactive or deleted after token issuance, THEN subsequent protected access SHALL return `403`; a new login SHALL also be denied.
- **MT-RBAC-08 — Intentional platform control:** WHEN a Superadmin reads either tenant's control-plane resources, THEN the requests SHALL succeed, proving denials are actor/scope decisions rather than invalid fixtures.
- **MT-RBAC-09 — Scoped list non-disclosure:** WHEN tenant actors list restaurants, branches, staff roles, or staff accounts, THEN no foreign-tenant identifiers SHALL appear.

## Success criteria

- Two isolated tenants, at least two same-restaurant branches, and all five actor types are exercised.
- Every requirement above is mapped to a passing database-backed HTTP assertion.
- Existing P0 acceptance, unit tests, typecheck, lint, and Production build remain green.
- CI uses ephemeral PostgreSQL and performs no deployment.
