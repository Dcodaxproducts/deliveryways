# Tasks

- [x] Add backend terminal-payment settlement and Super Admin terminal cancellation tests, then implement repository/service changes. Verify focused Orders tests.
- [x] Add backend `order.updated` room broadcast tests and implement event publication. Verify Notifications and Orders tests.
- [x] Remove create-only ownership fields from Super Admin subscription update requests.
- [x] Add Super Admin order cancel/refund service hooks and order-detail actions.
- [x] Add numeric restaurant display-number schema/migration/read-contract changes and selector display updates. Verify the migration against a backed-up scratch schema and regenerate Prisma Client.
- [x] Add deterministic menu-item reorder regression tests and repository implementation; wire category scope through the Restaurant Admin request.
- [x] Add Restaurant Admin realtime tests for immediate/scheduled order identities and cross-device status dismissal; implement listener behavior.
- [x] Add Restaurant Admin address-format tests and implementation.
- [x] Prove customer tax suppression and default-tax hydration with focused regression tests.
- [x] Run complete verification in Backend, Restaurant Admin, Customer, and Super Admin. Commit and push the repository changes.
