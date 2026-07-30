# Staff Nested Module Permissions Design

## Authorization Contract

1. `RolesGuard` maps the route family to the canonical sidebar module and
   verifies the HTTP operation.
2. The guard hydrates selected staff tenant/restaurant/branch context.
3. The domain service validates the resolved target resource against the
   staff assignment.

The service never infers permission from sidebar visibility; it only validates
scope after the guard grants the operation.

## Scope Rules

- Explicit restaurant assignments allow only those restaurant IDs.
- All-restaurants access allows any restaurant belonging to the owner tenant.
- Branch assignments remain enforced by existing branch-aware services.
- Static admin behavior remains unchanged.

## Frontend Contract

- FAQ list responses are normalized from `data.items`.
- Payment Settings uses the same canonical `payment-settings` permission:
  any granted operation permits viewing the module, `update` permits method
  editing, and `create` permits payout requests.
