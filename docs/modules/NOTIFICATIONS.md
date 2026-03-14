# Notifications Module — DeliveryWays

## Purpose
Tracks customer-facing order/payment email notifications with delivery status.

This module currently supports:
- persisting outbound email notifications
- automatic order/payment notification dispatch
- listing and inspecting notification history
- retrying failed notifications

---

## Data Model

### `Notification`
Each notification row stores one outbound delivery attempt.

Key fields:
- `tenantId`, `restaurantId`, `branchId`
- `orderId?`, `paymentTransactionId?`
- `recipientUserId?`, `recipientEmail`
- `channel` (`EMAIL`)
- `type` (`ORDER_*`, `PAYMENT_*`)
- `subject`, `body`, `payload`
- `status` (`PENDING | SENT | FAILED`)
- `sentAt`, `failedAt`, `errorMessage`

---

## API Surface
Base path: `/api/v1/notifications`

### List notifications
`GET /notifications`

Roles:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`
- `BRANCH_ADMIN`
- `CUSTOMER`

Query:
- `restaurantId?`, `branchId?`, `orderId?`, `paymentTransactionId?`
- `status?`, `type?`, `channel?`
- standard pagination/search/sort params

### Get notification details
`GET /notifications/:id`

### Retry notification
`POST /notifications/:id/retry`

---

## Flow Notes
- Order placement creates and dispatches `ORDER_PLACED` email.
- Order status changes create `ORDER_STATUS_CHANGED` or `ORDER_CANCELLED` email.
- Payment attempt creation creates `PAYMENT_ATTEMPT_CREATED` email.
- Payment lifecycle updates create `PAYMENT_PAID`, `PAYMENT_FAILED`, `PAYMENT_CANCELLED`, or `PAYMENT_REFUNDED` email.
- When SMTP is disabled, Mailer falls back to json transport for local/dev verification.

---

## Safety Rules
- Customers can only read/retry their own notifications.
- Admin access is limited to the same restaurant unless super admin.
- Notification rows are immutable history records except delivery status updates.
