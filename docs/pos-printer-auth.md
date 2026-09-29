# POS Printer authentication contract

## Security model

A POS printer is a dedicated `StaffUser` with `accountType=POS_PRINTER`. It is always bound to one tenant, restaurant, and branch. Its system-managed staff role contains only `order-management` and `table-reservations` permissions.

The global `PosPrinterAccessGuard` is authoritative. A POS printer JWT is rejected from every handler unless that handler explicitly carries `@PosPrinterAccess()`. Hidden frontend routes are not a security boundary. The permitted business handlers are order management and the two admin table-reservation handlers. Auth self-service is limited to logout, change-password, and me.

POS printer accounts cannot use `POST /auth/staff/login`; standard staff cannot use the dedicated POS printer login. Generic staff management excludes POS printer accounts, and their system-managed roles cannot be edited through staff-role APIs.

## Owner/admin account lifecycle

All lifecycle endpoints require a BUSINESS_ADMIN or BRANCH_ADMIN bearer token. Business admins may target any branch in their tenant. Branch admins are restricted to their own branch.

### Provision

`POST /pos-printer/accounts`

```json
{
  "email": "printer@example.com",
  "password": "minimum-12-chars",
  "firstName": "Kitchen",
  "lastName": "Printer",
  "branchId": "required-for-business-admin"
}
```

The password is bcrypt-hashed and is never returned or stored in `plainPassword`.

### List

`GET /pos-printer/accounts` returns only POS printer accounts owned by the authenticated admin and within that admin's tenant/branch scope.

### Activate/deactivate

`PATCH /pos-printer/accounts/:id/status` with `{ "isActive": false }`. Changing status revokes the refresh token. The global guard revalidates active account, active role, and exact tenant/restaurant/branch scope on every permitted request.

### Owner/admin password reset

`PATCH /pos-printer/accounts/:id/password` with `{ "newPassword": "minimum-12-chars" }`. Resetting a password revokes the refresh token and never persists plaintext.

## Device login

`POST /auth/pos-printer/login` accepts email and password and rejects non-POS-printer staff. A successful response includes branch-scoped access and refresh tokens, `accountType: POS_PRINTER`, and permission hints for `order-management` and `table-reservations`.

## Frontend handoff

1. Use only `POST /auth/pos-printer/login` for this login surface.
2. Route `accountType=POS_PRINTER` users to a shell containing only Order Management and Table Reservations.
3. Use the JWT branch scope; do not offer tenant, restaurant, or branch switching.
4. Treat HTTP 401 as an expired/deactivated/invalid session and HTTP 403 as a prohibited feature. Never use hidden navigation as the security boundary.
5. Do not call dashboard, menu, customer, payment, report, settings, staff, integration, printing-configuration, or other admin APIs; the backend rejects them.

## Migration

`20260929133000_add_pos_printer_staff_account_type` adds the enum and discriminator column/index. The migration is additive and has not been applied to any environment.
