# Checkout idempotency contract

## Objective

Cart checkout must create at most one order for one customer checkout attempt, including concurrent requests, transport retries, browser refreshes, and guest sessions.

## Request contract

The `POST /api/v1/cart/checkout` request keeps the existing three identity fields:

- idempotencyKey: UUID generated once for a checkout attempt.
- cartId: the server-issued cart identifier returned by GET /cart.
- cartVersion: the exact cart updatedAt timestamp returned by GET /cart.

Cart responses now also include `cartRevision`, a monotonic integer. New clients should send it as the optional checkout `cartRevision` field for an exact revision compare-and-swap. It remains optional during rollout so existing clients continue using `cartVersion`; every cart-content or cart-context mutation updates the parent cart timestamp and increments its revision in the same transaction. Cart-item mutations claim the expected parent revision before writing, so concurrent stale writers receive a deterministic conflict instead of overwriting each other.

The Customer application persists this tuple plus a canonical fingerprint of the checkout fields for transport retries. It generates a new key whenever the cart identity/version or checkout payload changes, and clears the attempt only after an order is accepted or a genuinely new cart is loaded.

## Durable scope and uniqueness

Orders persist:

- checkoutIdempotencyKey
- checkoutRequestHash

A database unique constraint covers tenantId, restaurantId, customerId, and checkoutIdempotencyKey. Guest users already have durable synthetic customer records, so authenticated and guest checkout use the same isolation boundary. The same UUID may safely occur in a different tenant, restaurant, or customer scope.

## Request binding

The server computes a SHA-256 hash from the normalized checkout body excluding idempotencyKey. The hash includes cartId, cartVersion, optional cartRevision, plus payment, fulfillment, address/contact, loyalty, tip, schedule, and note inputs.

- Same scope + key + same hash: return the existing order without repeating financial, coupon, loyalty, notification, or tracking side effects.
- Same scope + key + different hash: return deterministic HTTP 409.
- New key: cartId and cartVersion must exactly match the current server cart before order creation. When cartRevision is supplied, it must match too.

## Concurrency and rollback

The database unique constraint is the final concurrency arbiter. Both requests may pass the optimistic lookup, but only one transaction may commit the scoped key. A losing identical request reads and returns the committed order. A losing mismatched request returns HTTP 409.

The key is written inside the same transaction as an exact scoped cart compare-and-delete (tenant, restaurant, customer, id, timestamp, and optional revision), the order, payment transaction, coupon usage, guest address/contact update, and wallet/loyalty debits. Cart consumption therefore acts as a database compare-and-swap: a concurrent cart mutation aborts checkout, while concurrent identical retries resolve to the one committed order. A failed transaction restores the cart and leaves no durable key reservation, so the identical request can be retried safely.

Process-local locks are not correctness mechanisms. Cart-item writes and menu item/category cleanup acquire sorted transaction-scoped PostgreSQL advisory locks keyed by menu item before revalidating availability. This serializes add-to-cart against menu removal without introducing cross-process gaps or inconsistent lock ordering.

## Compatibility

Checkout without the three identity fields is rejected. Silently accepting legacy checkout would preserve duplicate-order risk, so it is not considered safe backwards compatibility. The Customer application is released with the API change.
