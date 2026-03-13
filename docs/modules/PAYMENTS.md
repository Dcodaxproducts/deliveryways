# Payments Module — DeliveryWays

## Purpose
Provides transaction tracking and operational payment lifecycle for orders.

This module currently supports:
- creating payment attempts against orders
- listing/filtering payment transactions
- marking payments paid/failed/cancelled
- creating refunds (full or partial)

---

## Data Model

### `Order` additions
- `paymentStatus` (`PENDING | PAID | FAILED | CANCELLED | REFUNDED`)
- `paidAt` (`DateTime?`)

### `PaymentTransaction`
Each row is an immutable transaction event for a charge/refund.

Key fields:
- `orderId`, `tenantId`, `restaurantId`, `branchId`
- `paymentMethod` (`COD | STRIPE | EASYPAISA | JAZZCASH | BANK_TRANSFER`)
- `type` (`CHARGE | REFUND`)
- `status` (`PENDING | PAID | FAILED | CANCELLED | REFUNDED`)
- `amount`, `currency`
- `providerRef`, `providerData`, `note`
- `processedAt`, timestamps

---

## API Surface
Base path: `/api/v1/payments`

### Create payment attempt for order
`POST /payments/orders/:orderId/attempts`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`
- `BRANCH_ADMIN`
- `CUSTOMER`

### List payment transactions
`GET /payments`

Query:
- `restaurantId?`, `branchId?`, `orderId?`
- `status?`, `paymentMethod?`, `type?`
- standard pagination/search/sort params

### Get payment transaction details
`GET /payments/:id`

### Mark transaction paid
`POST /payments/:id/mark-paid`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`
- `BRANCH_ADMIN`

### Mark transaction failed
`POST /payments/:id/fail`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`
- `BRANCH_ADMIN`

### Cancel transaction
`POST /payments/:id/cancel`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`
- `BRANCH_ADMIN`
- `CUSTOMER` (own order scope only)

### Refund transaction
`POST /payments/:id/refund`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`

---

## Flow Notes
- Order creation creates an initial `CHARGE` transaction with `PENDING` status.
- Marking a charge `PAID` updates order `paymentStatus=PAID` and `paidAt`.
- Full refund marks charge/order as `REFUNDED`.
- Partial refund keeps order status as `PAID` while logging refund transaction.

---

## Safety Rules
- Cross-restaurant access is blocked for non-super admins.
- Customer can access only own order-linked payments.
- Refund amount cannot exceed charge amount.
- Cumulative refunds cannot exceed the original paid charge.
