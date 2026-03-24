# Employees Module — DeliveryWays

## Purpose
Manages branch-scoped employee accounts for restaurant operations.

This phase supports:
- employee account creation under a restaurant + branch
- paginated listing and details lookup
- employee profile updates
- active/inactive status management
- soft removal of employee accounts

Employees are implemented as authenticated user accounts with role `BRANCH_STAFF`.

---

## Data Model

### `User` additions
The shared `UserRole` enum now includes:
- `BRANCH_STAFF`

Employee records reuse the existing `User` + `Profile` tables with:
- `role = BRANCH_STAFF`
- `tenantId`, `restaurantId`, `branchId`
- login credentials on `users`
- personal details on `profiles`

---

## API Surface
Base path: `/api/v1/employees`

### Create employee
`POST /employees`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`
- `BRANCH_ADMIN`

### List employees
`GET /employees`

Query:
- `restaurantId?`
- `branchId?`
- `isActive?`
- standard pagination/search/sort params
- `withDeleted?` (super admin only)
- `includeInactive?`

### Get employee details
`GET /employees/:id`

### Update employee
`PATCH /employees/:id`

### Update employee active status
`PATCH /employees/:id/status`

Body:
- `isActive`

### Soft remove employee
`DELETE /employees/:id`

---

## Flow Notes
- Employees are branch-scoped user accounts.
- Branch admins are locked to employees inside their own branch.
- Super admins may pass `restaurantId`; scoped admins use token restaurant scope.
- Employee emails must be unique within the restaurant among branch staff accounts.
- Deactivating/removing an employee clears stored refresh tokens.

---

## Safety Rules
- No cross-tenant access.
- No cross-restaurant access for scoped admins.
- No cross-branch access for branch-scoped users.
- Soft-deleted employees are excluded from normal reads.
