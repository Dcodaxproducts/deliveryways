# ORDER_COUPON_PHASE1.md

## Scope
Phase 1 covers:
1. Order module (branch-linked checkout + pricing + status flow)
2. Coupon module (validation + application + usage accounting)
3. Dev bootstrap utility endpoint for fast local/QA setup

---

## Order Domain (Phase 1)

### Core rules
- Every order belongs to exactly one `branchId`.
- Customer can place delivery order only if address is inside branch delivery radius.
- Pricing is server-side only: client does not send tax/delivery/discount totals.
- Order line data is snapshotted to avoid historical drift after catalog changes.

### Create order input
```ts
{
  branchId: string;
  orderType: 'DELIVERY' | 'TAKEAWAY';
  items: Array<{
    menuItemId: string;
    variationId?: string;
    quantity: number;
    modifiers?: Array<{ modifierId: string; quantity?: number }>;
    note?: string;
  }>;
  deliveryAddressId?: string; // required when DELIVERY
  couponCode?: string;
  paymentMethod: 'COD' | 'ONLINE';
  customerNote?: string;
}
```

### Checkout validation matrix
- branch exists + active
- branch supports order type
- item/variation/modifier existence + active
- item availability at branch (override aware)
- delivery: address required + lat/lng required + within `deliveryConfig.radiusKm`
- min order: `subtotal >= deliveryConfig.minOrderAmount`
- delivery fee from branch config + free delivery threshold logic
- tax from `branch.settings.taxation.taxPercentage`
- coupon checks (see coupon section)
- final total never negative

### Status flow
`PLACED -> CONFIRMED -> PREPARING -> OUT_FOR_DELIVERY -> DELIVERED`
with side states: `CANCELLED`, `REJECTED`

---

## Coupon Domain (Phase 1)

### Core checks
- coupon exists
- coupon is active
- now within validity window (`startsAt <= now <= expiresAt`)
- usage limits:
  - global max uses
  - per-customer max uses
- scope:
  - restaurant-scoped mandatory
  - optional branch scope
  - optional item/category scope
- minimum order amount
- discount type + cap:
  - FLAT amount
  - PERCENTAGE with `maxDiscountAmount`

### Calculation rules
- percentage discount applies on eligible subtotal only
- discount capped at eligible subtotal
- discount rounded to 2 decimals
- never allow negative final payable

---

## Dev Bootstrap Utility (Phase 1)

### Endpoint
`POST /api/v1/dev-testing/bootstrap-store`

### Creates
- Tenant
- Restaurant
- Main branch (with delivery/tax defaults)
- Base catalog seed (categories/items/variation)
- Base inventory seed (category/item)
- Seed customer user

### Notes
- endpoint disabled when `NODE_ENV=production`
- returns IDs + credentials for QA/dev login

---

## API Surface (planned)

### Orders
- `POST /orders` create order
- `GET /orders` list (role scoped)
- `GET /orders/:id` details
- `PATCH /orders/:id/status` status transition
- `POST /orders/:id/cancel` cancel

### Coupons
- `POST /coupons` create
- `GET /coupons` list
- `PATCH /coupons/:id` update
- `POST /coupons/validate` validate against cart
- `POST /coupons/:code/activate` / `suspend`

### Pricing
- `POST /orders/quote` pre-checkout quote (same engine as create)

---

## Test plan (must pass before push)
- unit: coupon validator
- unit: pricing calculator
- unit: delivery radius checker
- integration: quote + create order
- integration: coupon usage limit scenarios
- integration: branch scope and min order checks
