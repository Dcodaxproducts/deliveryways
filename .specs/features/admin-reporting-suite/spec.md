# Admin Reporting, Dashboard, Promotions, and Finance Suite

## Status
Drafted from latest product request for restaurant-admin and super-admin backend coverage.

## Existing baseline
- Super-admin dashboard APIs already exist for overview, restaurant trend, orders trend, revenue trend, order stats, customer stats, system alerts, recent activity, and top-performing restaurants.
- Table reservation listing already exists under `GET /customer-app/admin/table-reservations` for admin and branch-admin panels.
- Customer-facing promotional items already exist, but there is no dedicated admin promotions management bounded context yet.
- No generic CSV export endpoints currently exist for menu, orders, or customers.
- No dedicated restaurant-admin dashboard module currently exists; dashboard data is still centered in `admin/dashboard`.

## Requirements

### R1 — Restaurant dashboard overview
Provide restaurant-admin and branch-admin dashboard overview APIs with summary cards for orders, revenue, customers, deliverymen, employees, and operational highlights within allowed scope.

### R2 — Restaurant dashboard stats endpoints
Provide dedicated stats APIs for restaurant/branch scope covering orders, customers, deliverymen, and employees with branch-safe filtering.

### R3 — Restaurant CSV exports
Provide CSV export APIs for menu, orders, and customers within restaurant/branch scope.

### R4 — Reservation listing
Expose or formalize an admin-facing reservations listing API with filtering, sorting, pagination, and branch-safe access for restaurant admins.

### R5 — Promotions overview
Provide restaurant-admin promotional management overview data, including active promotions, scheduled promotions, expired promotions, promo-driven order counts, and promo-driven revenue snapshots.

### R6 — Happy hours CRUD
Provide CRUD APIs for happy-hour schedules with activation windows, scope, validation, and stats.

### R7 — Promotions CRUD
Provide CRUD APIs for restaurant promotions/campaigns with scope, validity windows, discount metadata, and performance stats.

### R8 — Auto-printing configuration
Provide backend APIs for auto-printing configuration/status per restaurant or branch, including enablement, printer target metadata, and recent print health summary where possible.

### R9 — Financial and orders reporting
Provide restaurant-scope financial reports and order reports with filters by date range, branch, payment status, and order status.

### R10 — Super-admin reports and analytics
Provide platform-level reports and analytics APIs beyond the current home dashboard, including aggregate financial and operational reports.

### R11 — Super-admin invoices and financials
Provide APIs for platform invoices/financial summaries, including restaurant-wise billing views if the business model requires them.

### R12 — Super-admin business models
Provide APIs to manage or report platform business/commercial model configuration per tenant/restaurant where applicable.

### R13 — Super-admin main home page
Expand the current super-admin home page APIs into a cohesive main-home payload or endpoint family suitable for the full dashboard screen.

### R14 — Role-safe scope enforcement
All new APIs must respect existing `SUPER_ADMIN`, `BUSINESS_ADMIN`, and `BRANCH_ADMIN` boundaries, with no branch user able to escape assigned branch scope.

### R15 — Consistent response and export behavior
All endpoints must follow the standard response envelope, and export endpoints must produce deterministic CSV column sets with clear filters reflected in metadata or file naming.

## Proposed backend delivery phases

### Phase 1 — Restaurant dashboard foundation
- Restaurant dashboard overview
- Orders stats
- Customer stats
- Deliverymen stats
- Employees stats
- Formal reservation listing endpoint reuse/alignment

### Phase 2 — Restaurant exports and reports
- Export menu CSV
- Export orders CSV
- Export customers CSV
- Financial report
- Orders report

### Phase 3 — Promotions management
- Promotions overview
- Happy hours CRUD + stats
- Promotions CRUD + stats

### Phase 4 — Operational controls
- Auto-printing configuration/status

### Phase 5 — Super-admin expansion
- Reports & analytics
- Invoices & financials
- Business models
- Main home page APIs

## Open product decisions to confirm
1. Should restaurant dashboard endpoints live under existing `admin/dashboard`, a new `restaurant-dashboard` namespace, or stay grouped by resource?
2. For CSV exports, should the API return raw `text/csv`, a signed file URL, or a stored file reference via storage module?
3. Are happy hours and promotions separate concepts in product, or is happy hour just one promotion type?
4. What exact invoice source exists today: Stripe charges, subscription plans, manual billing, or restaurant order commissions?
5. What does “business models” mean in this product: commission model, subscription package, feature plan, or restaurant type segmentation?
6. For auto-printing, do we already have printer device records anywhere, or is this a new persistence model?

## Recommended implementation direction
- Reuse the existing dashboard scope resolver patterns from `admin-dashboard` for all new scoped analytics.
- Start with restaurant dashboard foundation first, because most of it can be delivered from existing orders/users/staff/deliverymen modules without introducing new schema.
- Treat CSV export as reporting endpoints layered on top of existing list/report queries, not separate business logic.
- Treat promotions/happy-hours and auto-printing as separate bounded contexts only if schema/config needs become substantial; otherwise begin within existing restaurant/admin modules and extract later if needed.
- Keep super-admin billing/business-model APIs for a later phase until product definitions are explicit.
