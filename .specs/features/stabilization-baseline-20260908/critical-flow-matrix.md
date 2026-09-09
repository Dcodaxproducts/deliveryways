# Critical-flow protection matrix

This matrix describes current behavior to preserve. It is a regression contract, not a proposal to change flows.

## P0 business flows

| ID | Flow and UI entry | API surface | Actors | Persistent effects | Invariants that must not break | Current coverage / missing proof |
|---|---|---|---|---|---|---|
| FLOW-01 | Partner/Superadmin/customer login, refresh, logout, password reset | `/auth/login`, `/auth/staff/login`, `/auth/refresh`, `/auth/logout`, OTP/reset, `/auth/me` | Super Admin, Business Admin, Branch Admin, Staff, Customer | Refresh hash, verification/reset state, profile/account state | Wrong role or inactive/unapproved user cannot enter; refresh rotation cannot cross users; logout invalidates the session; a public-page 401 cannot clear a newly established session | API unit/service coverage and Partner/customer client tests exist. Missing: cross-app browser journey and Superadmin tests |
| FLOW-02 | Partner registration and Superadmin owner approval | `/auth/register-tenant`, `/auth/admin/register-tenant`, `/admin/users/business-admins/:id/approve|reject` | Applicant, Super Admin | Transactionally creates User, Tenant, Restaurant, main Branch, and TenantSubscription; approval flags | Bootstrap is atomic; exactly one tenant/restaurant/main branch/subscription is linked; rejected/unapproved owner cannot access protected business operations | API registration tests exist. Missing: full register-to-approval-to-first-login acceptance |
| FLOW-03 | Partner restaurant and branch workspaces | `/restaurants/*`, `/branches/*` | Super Admin, Business Admin, Branch Admin, Staff per route | Restaurant/branch records, hours, delivery times, closure, settings, activation | Tenant ownership is immutable; branch-scoped actors cannot mutate another branch; exactly one intended main branch; suspension/activation is respected everywhere | Service/repository and frontend tests exist. Missing: two-tenant and two-branch end-to-end isolation suite |
| FLOW-04 | Partner menu/category/item/modifier management; storefront catalog | `/menu-categories/*`, `/menu-items/*`, `/modifier-groups/*`, `/modifiers/*`, `/variations/*`, `/restaurant-menus/*`; public catalog endpoints | Business Admin, permitted Staff; public shopper reads | Menu graph, assignments, price overrides, visibility | Relationships remain tenant/restaurant scoped; inactive/unavailable products do not become orderable; configured prices and modifier rules are identical in quote and checkout | Broad API/repository and Partner/customer tests exist. Missing: admin-write-to-storefront-read contract journey |
| FLOW-05 | Storefront cart, quote, fulfillment selection, coupon, checkout | `/cart/*`, quote/checkout endpoints, `/coupons/validate` | Guest, Customer; scoped admins for support views | Cart/items, address, fulfillment, coupon state, eventual Order | Server is authoritative for price; totals equal items + modifiers + fees + tax - discounts; coupon scope/limits hold; restaurant/branch/tenant cannot switch implicitly; idempotent retry does not duplicate an order | Cart/coupon/order tests exist. Missing: canonical golden-total cases across guest/customer and fulfillment modes |
| FLOW-06 | Storefront/Partner order lifecycle and realtime tracking | `/orders/*`; Socket.IO `/orders-tracking` | Customer, Business Admin, Branch Admin, Staff, Deliveryman, Super Admin | Order/items/status history/review/cancellation | Only allowed state transitions occur; cancellation and uncancellation permissions hold; user sees only own/scoped orders; realtime event scope matches REST authorization and never leaks across tenants | Order service/integration and gateway tests exist. Missing: complete REST + WebSocket lifecycle acceptance with two tenants |
| FLOW-07 | Checkout payments, Stripe webhook, PayPal return/cancel, reconciliation, refunds, wallets and payouts | `/payments/*`, public provider callbacks/webhooks | Customer, business finance roles, Super Admin, provider | PaymentTransaction, order payment state, subscription payment state, wallet ledger, payout | Signed webhooks only; provider event/attempt is idempotent; amount/currency/order binding cannot change; paid/refunded states are not duplicated or reversed incorrectly; ledger balances | Provider/service tests exist. Missing: deterministic webhook replay, concurrent retry, and ledger-invariant acceptance |
| FLOW-08 | Partner staff/RBAC administration | `/staff-management/*`, `/staff-roles/*` | Business Admin, Branch Admin, Super Admin | StaffUser, StaffRole, module permissions, branch assignment | Tenant filter is automatic; role assignment cannot grant cross-tenant or cross-branch access; branch admin remains limited to own branch; deleted/inactive staff loses access | API and Partner tests exist. Missing: deny-matrix acceptance for every role/resource pair |
| FLOW-09 | Superadmin dashboard, business owners, plans, subscriptions, settings | `/admin/dashboard/*`, `/admin/package-plans/*`, subscription/admin user/settings endpoints | Super Admin | Platform plan/subscription/settings and approval state | Only Super Admin can access; dashboard contract fields remain stable; plan changes do not corrupt existing subscriptions; settings requests on public pages do not invalidate auth | API tests cover pieces; Superadmin has no test files. Highest immediate frontend risk |
| FLOW-10 | Partner/Superadmin reports, invoices and payout operations | report/export/invoice/payout endpoints | Authorized business roles, Super Admin | GeneratedInvoice/Event, payout request, exports and emails | Financial scope and totals match source orders/transactions; invoice history remains auditable; retry/resend is controlled; payout cannot exceed eligible balance | Service/repository and Partner tests exist. Missing: end-to-end reconciliation and permission-denial suite |

## P1 supporting flows

| Area | Protection target |
|---|---|
| Customer account | Registration, verification, profile, addresses, favorites, wallet, loyalty, reservations, reviews, notifications, and deletion remain restaurant/tenant scoped |
| Promotions | Coupon, promotion, gift-card, loyalty, and group-order rules produce deterministic server-side totals and usage records |
| POS and inventory | Draft/order creation and inventory movement remain branch scoped and transactional |
| Chat and notifications | Thread/event subscriptions require authorized tenant/restaurant/branch scope and cannot disclose another tenant's data |
| WinOrder | Catalog mappings, exports, payment mappings, and status events are idempotent and do not overwrite unrelated orders |
| Content/settings | Public content is readable only for the resolved restaurant; administrative updates require the correct business or platform role |

## Cross-cutting authorization contract

- Global request chain includes throttling, JWT authentication where required, verified-user checks, role checks, subscription-feature checks, and tenant-access checks.
- Tenant discovery resolves request context from trusted host/header inputs and stored restaurant/tenant records.
- Tenant-scoped queries must remain inside the active tenant context.
- Explicit tenant, restaurant, and branch identifiers in body, query, or resource lookup cannot override the authenticated actor's scope.
- Branch Admin and Staff permissions are narrower than Business Admin; Super Admin bypass is intentional only on explicitly authorized platform routes.
- API success responses preserve the `{ success: true, data, message, meta? }` envelope unless an endpoint intentionally streams or returns a raw provider response.

## Realtime contract

The `/orders-tracking` namespace authenticates the socket and supports order subscription/unsubscription plus authorized admin subscription. The protected event family includes `order.created`, `order.status.updated`, `order.updated`, `order.tracking.snapshot`, `order.tracking.update`, and `order.tracking.error`. Tenant, restaurant, branch, and order rooms must be derived from authorized server-side scope, never trusted solely from client input.

## Current test inventory

| Repository | Test files captured | Main strength | Immediate gap |
|---|---:|---|---|
| API | 105 | Broad controller/service/repository coverage for core domains | No single isolated-database P0 acceptance suite |
| Partner | 92 | Broad feature/client coverage | No complete browser acceptance journey |
| Storefront | 83 | Auth, cart, checkout, orders, payments and catalog coverage | No complete guest/customer checkout journey against isolated API |
| Superadmin | 0 | None | Login, dashboard, approval, plans/subscriptions, settings and logout are unprotected |

## Safe acceptance-environment rules

1. Automated write tests use a disposable database and isolated service namespace.
2. Development is the first integrated environment; Staging is the promotion gate.
3. Production automation is read-only except for explicitly approved, reversible smoke fixtures.
4. `test.feastflow.co` is reserved for controlled final smoke checks; tests must not reset or destructively reseed it.
5. `feastflow.co`, `www`, `demo`, and `flutterweb` are outside the automated acceptance-test target set.

## Next protection order

1. Superadmin login/dashboard regression tests.
2. Superadmin tenant approval and package/subscription tests.
3. Isolated multi-tenant auth and deny-matrix suite.
4. Golden cart/quote/checkout totals.
5. Order lifecycle with REST/WebSocket parity.
6. Payment webhook replay/idempotency and ledger reconciliation.
