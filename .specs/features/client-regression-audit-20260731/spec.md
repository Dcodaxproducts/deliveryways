# Client Regression Audit — 2026-07-31

## Objective

Correct the reported storefront, promotion, reporting, payment, order-flow, and
landing-management regressions as one coordinated release. Every behavior below
must be backed by a focused regression test or a documented manual verification.

## Storefront and checkout

- `SF-01` Homepage fulfillment controls must not show an inaccurate distance.
  Distance is removed until it can be calculated from a confirmed customer
  location and branch coordinates.
- `SF-02` Cart rows must show an image only when the product/deal has an image.
  A failed remote image may be hidden, but a missing image must not be replaced
  with a product placeholder.
- `SF-03` Delivery addresses require street, house number, postal code, and city
  for guest checkout and saved customer addresses.
- `SF-04` Checkout contact validation identifies and highlights the exact invalid
  name, phone, or email field.
- `SF-05` After a delivery address is resolved, the mini cart shows the effective
  delivery fee, minimum-order value, and free-delivery threshold.
- `SF-06` A cuisine card's item count and its detail-page item list use the same
  restaurant, branch, category visibility, item visibility, and schedule rules.
- `SF-07` Active gift-card products are visible in the configured homepage section.

## Coupons, promotions, and Happy Hour

- `PR-01` Coupon, promotion, and Happy Hour editors expose the same customer
  audiences: all customers or registered customers.
- `PR-02` All three editors support restaurant-wide, multiple-category, and
  multiple-product scope without a ten-item selection ceiling.
- `PR-03` Percentage discounts honor a positive maximum discount; an omitted or
  zero maximum does not reduce the discount to zero.
- `PR-04` Happy Hour applies only to immediate orders placed while its configured
  window is active. Scheduled/preorders never receive Happy Hour pricing.

## Reports and payments

- `RP-01` Financial report values use valid revenue transactions/orders and render
  the restaurant currency, with EUR/€ for EUR restaurants.
- `RP-02` Daily, weekly, and monthly selection controls both the charts and the
  summary cards.
- `RP-03` Order Management renders money with the restaurant currency.
- `RP-04` Date, status, delivery/pickup, and other active filters also update the
  displayed count and revenue total.
- `RP-05` Restaurant Admin payment methods are read-only. Only Super Admin can
  update a restaurant's allowed payment methods and PayPal configuration.
- `RP-06` Super Admin can view and manage the existing per-restaurant PayPal
  provider configuration without exposing stored secrets.

## Order flow

- `OF-01` Restaurant Admin exposes order notification-sound controls. When enabled,
  a new-order alert repeats until that order is accepted or rejected.
- `OF-02` Accepting/rejecting an order dismisses the matching persistent alert.
- `OF-03` Rejected/cancelled orders render a terminal rejected/cancelled state in
  customer tracking and never fall through to Delivered.
- `OF-04` Manual print and auto-print behavior is discoverable from the Orders/POS
  UI and uses the existing printing configuration safely.

## Landing management

- `LP-01` Super Admin can edit every landing section represented by the public
  landing-page content contract, including navigation/footer/contact/page content
  and every home section.

## Global constraints

- No production deployment is part of this task.
- No unrelated dirty checkout may be modified.
- Tenant and branch isolation must remain intact.
- Financial, promotion, and status mutations must go through existing services and
  legal state transitions.
- All affected repositories must pass type checking, tests, lint, and production
  builds before push.
