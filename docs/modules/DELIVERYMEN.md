# Deliverymen Module — DeliveryWays

## Purpose
Manages rider records for restaurant branches and assigns delivery orders to available deliverymen.

This first phase supports:
- deliveryman creation and profile management
- availability/status management
- paginated listing and details lookup
- order assignment for delivery orders
- branch-scoped access for business/branch admins

---

## Data Model

### `Deliveryman`
Each deliveryman belongs to one tenant, one restaurant, and one branch.

Key fields:
- `tenantId`, `restaurantId`, `branchId`
- `firstName`, `lastName`, `email`, `phone`
- `vehicleType?`, `vehicleNumber?`
- `status` (`OFFLINE | AVAILABLE | BUSY | INACTIVE`)
- `isActive`, `deletedAt`
- timestamps

### `Order` additions
Orders now support delivery assignment fields:
- `deliverymanId?`
- `assignedAt?`
- `deliveredAt?`

Assignment moves the order to `OUT_FOR_DELIVERY`.

---

## API Surface
Base path: `/api/v1/deliverymen`

### Create deliveryman
`POST /deliverymen`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`
- `BRANCH_ADMIN`

### List deliverymen
`GET /deliverymen`

Query:
- `restaurantId?`
- `branchId?`
- `status?`
- standard pagination/search/sort params

### Get deliveryman details
`GET /deliverymen/:id`

### Update deliveryman profile
`PATCH /deliverymen/:id`

### Update deliveryman status
`PATCH /deliverymen/:id/status`

### Assign order to deliveryman
`POST /deliverymen/:id/assign-order`

Body:
- `orderId`

### Soft remove deliveryman
`DELETE /deliverymen/:id`

---

## Flow Notes
- Deliverymen are branch-scoped resources.
- Branch admins are locked to their own branch deliverymen.
- Only `DELIVERY` orders can be assigned.
- Assigned orders must belong to the same restaurant and branch as the deliveryman.
- Assignment stamps `assignedAt` and moves order status to `OUT_FOR_DELIVERY`.
- Order status update flow now stamps `deliveredAt` when an order becomes `DELIVERED`.

---

## Safety Rules
- No cross-restaurant assignment.
- No cross-branch assignment.
- Inactive/deleted deliverymen cannot receive orders.
- Re-assignment to a different deliveryman is blocked once already assigned.
