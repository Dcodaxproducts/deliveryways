# API Audit — Phase 2 Admin/Customer Separation

## Goal

- Keep **customer mobile app APIs** inside `customer-app`
- Keep **admin/staff management APIs** in clearly admin-oriented modules/folders
- Remove or consolidate **redundant / overlapping endpoints**
- Preserve one clear flow per concern

## Current Customer-Facing Surface

### Customer App
- `GET /customer-app/home`
- `GET /customer-app/cuisines`
- `GET /customer-app/cuisines/:cuisineId/items`
- `GET /customer-app/promotional-items`
- `GET /customer-app/privacy-policy`
- `GET /customer-app/help-support`
- `GET /customer-app/faqs`
- `GET /customer-app/favorites`
- `POST /customer-app/favorites`
- `DELETE /customer-app/favorites/:menuItemId`
- `GET /customer-app/loyalty-points`
- `POST /customer-app/loyalty-points/redeem`
- `GET /customer-app/wallet`
- `GET /customer-app/table-reservations`
- `POST /customer-app/table-reservations`

### Auth / Customer Self-Service
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `PATCH /auth/me/avatar`
- `PATCH /auth/me/profile`
- `DELETE /auth/account`
- `POST /auth/cancel-deletion`

## Current Admin/Staff-Oriented Surface Mixed Into Non-Admin Modules

### Auth controller has admin-only routes
These should be reviewed for relocation into admin-focused structure:
- `GET /auth/customers`
- `GET /auth/customers/:id`
- `POST /auth/admin/users/force-delete`
- `PATCH /auth/admin/business-admins/:id/approve`

### Tenant/Restaurant/Branch modules contain force-delete and action routes
These are valid operations, but need consistency and possibly admin grouping:
- `DELETE /tenants/:id/force`
- `DELETE /restaurants/:id/force`
- `DELETE /branches/:id/force`
- `PATCH /restaurants/:id/suspend`
- `PATCH /restaurants/:id/activate`
- `PATCH /branches/:id/suspend`
- `PATCH /branches/:id/activate`

## First Redundancy Candidates

### 1) Coupon status endpoints overlap
Current:
- `POST /coupons/:code/activate`
- `POST /coupons/:code/suspend`
- `PATCH /coupons/:code/status`

Observation:
- `activate` and `suspend` are convenience wrappers around `setStatus`
- this is likely redundant API surface

Recommended direction:
- keep **one canonical endpoint**: `PATCH /coupons/:code/status`
- remove `POST /coupons/:code/activate`
- remove `POST /coupons/:code/suspend`

### 2) Auth controller mixes customer self-service and admin user management
Observation:
- `auth` currently contains both authentication and admin customer management
- this is not clean module separation

Recommended direction:
- keep auth-only endpoints in `auth`
- move admin customer/admin actions to an admin-focused module/folder

### 3) Restaurant/branch activate/suspend action endpoints may be simplified later
Observation:
- `PATCH :id/suspend` + `PATCH :id/activate` is explicit, but duplicates “set status” style logic
- not necessarily wrong, but less consistent than a single status endpoint

Recommended direction:
- keep for now unless frontend/admin consumers want canonical status endpoints
- lower priority than coupon cleanup and auth/admin split

## Safe Cleanup Order

1. ✅ **Move admin-only auth routes into admin structure** (`/admin/users`)
2. ✅ **Remove coupon status duplicates** and keep canonical `PATCH /coupons/:code/status`
3. 🔄 Branch fetching flow aligned: super admin can fetch all or filter by restaurant; customer/business/branch roles use token restaurant scope; nearest-branch lookup supports `lat`/`lng`
4. Review any remaining controller overlaps after Swagger diff
5. Only then evaluate restaurant/branch action-route consolidation

## Important Rule

Do **not** remove endpoints blindly if they may already be consumed by frontend or admin panel.
Prefer:
- move + deprecate
- or consolidate after confirming no active consumer depends on old routes
