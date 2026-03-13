# Menus Module — DeliveryWays

## Purpose
Adds a restaurant-level menu layer on top of existing categories/items/variations/modifiers.

This lets a restaurant:
- create multiple menus
- reuse existing menu items across menus
- control which items appear in a given menu
- sort items within each menu

Examples:
- Breakfast Menu
- Lunch Menu
- Dinner Menu
- Ramzan Deals
- Kids Menu

---

## Why this exists
Before this module, the system had:
- menu categories
- menu items
- item variations
- modifier groups/modifiers

But it did **not** have a top-level restaurant menu collection.

So items existed, but restaurants could not group selected items into separate menus.

---

## Data model

### `RestaurantMenu`
Restaurant-owned menu collection.

Key fields:
- `id`
- `restaurantId`
- `name`
- `slug`
- `description?`
- `sortOrder`
- `isActive`
- `deletedAt`
- timestamps

### `RestaurantMenuItem`
Pivot between a restaurant menu and an existing menu item.

Key fields:
- `id`
- `restaurantMenuId`
- `menuItemId`
- `sortOrder`
- `isActive`
- timestamps

---

## Relations
- one `Restaurant` → many `RestaurantMenu`
- one `RestaurantMenu` → many `RestaurantMenuItem`
- one `MenuItem` → many `RestaurantMenuItem`
- one `MenuItem` can belong to multiple menus

This keeps items reusable and avoids duplication.

---

## API surface
Base path: `/api/v1/menus`

### Create menu
`POST /menus`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`

Body:
- `restaurantId?` (optional for non-super; resolved from token)
- `name`
- `slug`
- `description?`
- `sortOrder?`
- `isActive?`

---

### List menus
`GET /menus`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`
- `BRANCH_ADMIN`
- `CUSTOMER`

Query:
- `restaurantId?`
- `page?`
- `limit?`
- `search?`
- `sortBy?`
- `sortOrder?`
- `includeInactive?`

Behavior:
- business/branch/customer users default to `restaurantId` from token
- super admin can fetch all when `restaurantId` is omitted
- super admin can also filter by `restaurantId`

---

### Get menu details
`GET /menus/:id`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`
- `BRANCH_ADMIN`
- `CUSTOMER`

Returns menu + attached items.

---

### Update menu
`PATCH /menus/:id`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`

Body:
- `name?`
- `slug?`
- `description?`
- `sortOrder?`
- `isActive?`

---

### Delete menu
`DELETE /menus/:id`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`

Behavior:
- soft delete via `deletedAt`
- also sets `isActive = false`

---

### Attach item to menu
`POST /menus/:id/items`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`

Body:
- `menuItemId`
- `sortOrder?`
- `isActive?`

Rules:
- item must exist
- item must belong to the same restaurant as menu
- duplicate attachment is blocked

---

### List items in menu
`GET /menus/:id/items`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`
- `BRANCH_ADMIN`
- `CUSTOMER`

Query:
- `page?`
- `limit?`
- `search?`
- `sortBy?`
- `sortOrder?`
- `includeInactive?`

Returns attached items with category and active variations.

---

### Update attached item metadata
`PATCH /menus/:id/items/:linkId`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`

Body:
- `sortOrder?`
- `isActive?`

---

### Remove item from menu
`DELETE /menus/:id/items/:linkId`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`

Behavior:
- hard deletes the pivot/link row only
- does **not** delete the base menu item

---

## Auth and scoping
For logged-in non-super users:
- `restaurantId` is derived from JWT token (`rid`)
- passing another restaurant id is rejected as cross-restaurant access

For super admin:
- can create/fetch/update across restaurants
- list endpoint supports all restaurants when no `restaurantId` filter is passed

---

## Flow
1. restaurant creates reusable base items in existing menu item APIs
2. restaurant creates one or more restaurant menus
3. restaurant attaches selected existing items into specific menus
4. client apps fetch menus and menu items for display

---

## Notes
- categories are still valid and stay separate
- menus do **not** replace categories
- menus are a higher-level grouping layer over reusable items
- current v1 is restaurant-scoped only
- branch-specific or schedule-based menus can be added later if needed
