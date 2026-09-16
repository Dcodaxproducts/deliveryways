# FeastFlow Reported Issues Batch 3 Design

**Spec**: `.specs/features/reported-issues-batch-3/spec.md`
**Status**: Approved from the user's batch-3 instruction and stated scope assumptions

## Architecture

- Restaurant and menu-item uniqueness stays in the existing Service → Repository path. Repositories perform scoped, case-insensitive active-name lookups; services normalize input and return business-safe validation errors.
- No database unique index is added in this batch because read-only Staging preflight found existing scoped duplicates. This preserves data and prevents the migration from failing. A later cleanup can add partial expression indexes after explicit data approval.
- Interactive guest registration requires `firstName`. Existing automatic cart-session callers send the explicit `Guest Customer` technical identity.
- Google token verification remains unchanged for issuer/audience/email verification. After verification, the auth service resolves by email plus restaurant. A missing scoped customer is provisioned through the existing user/profile service using a random unusable password.
- The Customer app supplies a static default icon through Next.js metadata assets. The existing branding provider can still replace icon links at runtime.

## Reuse

| Existing component | Use |
| --- | --- |
| `RestaurantsService` / `RestaurantsRepository` | Existing restaurant create/update boundaries and tenant scope. |
| `MenuItemService` / `MenuItemRepository` | Existing create, bulk, update, duplicate, and validation patterns. |
| `UsersService.create` | Transactional user/profile creation for Google customers and guests. |
| `verifyGoogleIdToken` | Existing Google verification and audience enforcement. |
| Customer auth validation/messages | Localized required-name error. |
| `BrandingProvider` | Runtime restaurant-specific favicon override. |

## Error Strategy

| Scenario | Result |
| --- | --- |
| Scoped active restaurant collision | HTTP 400 with tenant-scoped name message. |
| Scoped active menu-item collision | HTTP 400 with restaurant-scoped name message. |
| Blank explicit guest name | DTO/UI validation; request not created from the UI. |
| Invalid Google identity | Existing HTTP 401 behavior. |
| Missing scoped Google customer | Create verified scoped customer and return normal auth session. |

## Decisions

| Decision | Rationale |
| --- | --- |
| Tenant-scoped restaurant names | Matches ownership boundaries and tracker recommendation. |
| Restaurant-scoped menu-item names | Matches menu ownership and operator expectations. |
| Application enforcement before DB index | Existing duplicates make a safe constraint migration impossible without data mutation. |
| Explicit generic identity for automatic cart guests | Preserves anonymous shopping while requiring names in the interactive guest flow. |
| Auto-provision Google customers | Makes the existing “Sign in with Google” action complete for new and existing customers. |
