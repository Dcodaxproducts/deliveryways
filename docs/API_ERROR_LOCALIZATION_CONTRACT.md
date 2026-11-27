# API error localization contract inventory

## Scope and audit snapshot

Audited from cumulative deployed API base `426de8d5d0f1a80c55290a934ddd02a1e712ff88` on 2026-11-27. The HTTP surface is normalized by `GlobalExceptionFilter`, so the contract applies to controller, service, guard, DTO-validation, Prisma, and throttling failures returned to Customer, Restaurant Admin/POS, and Superadmin web clients.

Static inventory found 1,642 explicit Nest HTTP-exception throw sites. High-use UI domains include auth (106), addresses (8), cart (60), orders (129), payments (163), menu (237), tenants (13), admin (165), and customer-app (57). DTOs in those domains contain 1,826 validation decorators. Only 24 throw sites already supplied explicit structured codes, which made per-service conversion error-prone; normalization therefore lives at the global boundary.

UI coordination:

- Customer localization branch `62c1b2379782646072452bcab729ec38637adbb3` still reads legacy `message` copy and detects modifier prose. That copy remains available for compatibility.
- Restaurant Admin localization branch `dadeed6` intentionally does not render backend prose and retains `error.code` and `error.details`. It can adopt the stable codes below without exposing DTO/property text.
- Superadmin receives the same normalized envelope as Restaurant Admin.

## Envelope

```json
{
  "success": false,
  "message": "Legacy safe copy for backward compatibility",
  "error": {
    "code": "MODIFIER_MIN_SELECTIONS_NOT_MET",
    "message": "Legacy safe copy for backward compatibility",
    "params": {
      "groupName": "Choose Sauces",
      "minSelections": 2
    },
    "details": null
  },
  "meta": {
    "timestamp": "ISO-8601",
    "path": "/api/v1/cart/items"
  }
}
```

UI code must localize from `error.code` and interpolate `error.params`. `message` is a compatibility fallback, not a translation key. Existing structured `details` are preserved.

## Stable mapping inventory

| API condition                                         | Stable code                                                                                                                                                                            | Params/details for UI                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| DTO/class-validator failure                           | `VALIDATION_ERROR`                                                                                                                                                                     | `details[]: { name, code, allowedValues? }`; top-level message is generic |
| Forbidden extra DTO property                          | `VALIDATION_ERROR`                                                                                                                                                                     | violation code `FIELD_NOT_ALLOWED`, field in `name`                       |
| Invalid enum value                                    | `VALIDATION_ERROR`                                                                                                                                                                     | violation code `INVALID_ENUM_VALUE`, `allowedValues`                      |
| Other invalid field value                             | `VALIDATION_ERROR`                                                                                                                                                                     | violation code `INVALID_FIELD_VALUE`                                      |
| `<item> requires modifier selection(s): ...`          | `MODIFIER_SELECTION_REQUIRED`                                                                                                                                                          | `itemName`, `modifierNames[]`                                             |
| `<group> requires at least N [modifier] selection(s)` | `MODIFIER_MIN_SELECTIONS_NOT_MET`                                                                                                                                                      | `groupName`, `minSelections`                                              |
| `<group> allows at most N [modifier] selection(s)`    | `MODIFIER_MAX_SELECTIONS_EXCEEDED`                                                                                                                                                     | `groupName`, `maxSelections`                                              |
| `<item/deal> requires at least N item(s)`             | `MINIMUM_ITEM_QUANTITY_NOT_MET`                                                                                                                                                        | `itemName`, `minQuantity`                                                 |
| Raw `<field> is required` service message             | `REQUIRED_FIELD_MISSING`                                                                                                                                                               | raw field moves to `params.field`                                         |
| Tenant/branch/restaurant context missing              | `TENANT_CONTEXT_REQUIRED`, `BRANCH_CONTEXT_REQUIRED`, `RESTAURANT_CONTEXT_REQUIRED`                                                                                                    | none                                                                      |
| Delivery/pickup/menu unavailable                      | `DELIVERY_UNAVAILABLE`, `PICKUP_UNAVAILABLE`, `MENU_UNAVAILABLE`                                                                                                                       | existing explicit details preserved                                       |
| Invalid credentials/token/session                     | `INVALID_CREDENTIALS`, `INVALID_AUTH_TOKEN`, `AUTHENTICATION_REQUIRED`                                                                                                                 | none                                                                      |
| Cart contains another branch                          | `CART_BRANCH_CONFLICT`                                                                                                                                                                 | none                                                                      |
| Domain not found                                      | `TENANT_NOT_FOUND`, `BRANCH_NOT_FOUND`, `RESTAURANT_NOT_FOUND`, `ORDER_NOT_FOUND`, `PAYMENT_NOT_FOUND`, `MENU_NOT_FOUND`, `ADDRESS_NOT_FOUND`, `USER_NOT_FOUND`, `PROMOTION_NOT_FOUND` | none                                                                      |
| Domain conflict                                       | corresponding `*_CONFLICT`                                                                                                                                                             | none                                                                      |
| Domain access violation                               | corresponding `*_ACCESS_FORBIDDEN`                                                                                                                                                     | none                                                                      |
| Generic 401/403/404/409                               | `AUTHENTICATION_REQUIRED`, `ACCESS_FORBIDDEN`, `RESOURCE_NOT_FOUND`, `RESOURCE_CONFLICT`                                                                                               | none                                                                      |
| Prisma unique/not-found/database errors               | existing `UNIQUE_CONSTRAINT_VIOLATION`, `RECORD_NOT_FOUND`, `DATABASE_*`                                                                                                               | existing safe message/details                                             |
| Rate limit                                            | `TOO_MANY_REQUESTS`                                                                                                                                                                    | none                                                                      |

Explicit uppercase snake-case domain codes supplied by services remain authoritative. Nest prose such as `Bad Request` is no longer accepted as a code.

## Compatibility and localization rules

1. Customer may continue rendering the safe `message` while migrating modifier detection to codes/params.
2. Admin/Superadmin should never render raw backend validation messages; use the already-established caller-owned localized fallback and optionally map codes.
3. Validation property names are absent from the top-level user-facing sentence and remain structured for form-field association.
4. German `Accept-Language` behavior remains intact, including checkout-specific messages and safe status fallbacks.
5. Developer diagnostics and logger output are unchanged and are not translated.

## Query, cache, and concurrency impact

This normalization is in-memory string matching at the final HTTP exception boundary. It adds no database queries, joins, transactions, Redis keys, cache invalidation, jobs, retries, or concurrency behavior. Matching is bounded by one short message and a fixed rule list.
