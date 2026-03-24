# Customer App Module — DeliveryWays

## Purpose
Provides customer-facing app APIs for home screen content, favorites, cuisines, privacy policy, help/support, and FAQs.

---

## API Surface
Base path: `/api/v1/customer-app`

### Favorites
Authenticated endpoints for customer saved menu items.

Endpoints:
- `GET /customer-app/favorites`
- `POST /customer-app/favorites`
- `DELETE /customer-app/favorites/:menuItemId`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`
- `BRANCH_ADMIN`
- `CUSTOMER`

Scope rule:
- `CUSTOMER` users can only manage their own favorites.
- Admin/staff roles must provide `customerId` in query, and the backend verifies the customer belongs to the same restaurant scope.

### Public content
Public endpoints:
- `GET /customer-app/privacy-policy`
- `GET /customer-app/help-support`
- `GET /customer-app/faqs`
- `GET /customer-app/cuisines`
- `GET /customer-app/home`

Required query:
- `restaurantId`

Optional query:
- `branchId`

---

## Phase 1 implementation note
This is a **Phase 1 minimal implementation** using existing fields/data.

Current behavior:
- privacy policy is read from existing restaurant settings/public content fields
- help/support is read from existing branch/restaurant settings plus support contact fields
- FAQs are read from existing branch/restaurant settings
- home screen promotional items are derived from existing menu item/category data

If you want:
- true curated promotional items
- admin-managed home sections
- proper CMS-managed Privacy / FAQ / Help content

then **Phase 2** should add dedicated DB models + admin APIs.

Possible Phase 2 modules:
- Wallet
- Loyalty points + redeem
- Table reservation module
