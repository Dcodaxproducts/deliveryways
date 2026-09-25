# Partner branch workflow operations

## QA fixture

Run key: qa-partner-branch-v1-20260925. The tool requires explicit QA_TENANT_ID and QA_RESTAURANT_ID and verifies that relationship before work. It has not been run against Staging.

- npm run qa:partner-branch -- dry-run: validate scope and print stable IDs without mutation.
- apply: one transaction, idempotent upserts, then a local pre-change branding manifest.
- verify: exact tenant/restaurant-scoped fixture counts.
- rollback: requires the matching manifest and restaurant run-key marker; deletes exact fixture IDs only and restores branding.

Optional QA_MANIFEST_PATH chooses the operator-controlled snapshot path. Fixtures include synthetic branding, North active and Riverside inactive branches, two menus, catalog/category and item overrides, and a synthetic contact submission. Orders are deliberately omitted because the schema requires an existing customer; the tool never attaches data to an unknown Staging user. No credentials or real PII are stored.

## Migration rehearsal (scratch only)

1. Create a disposable PostgreSQL database and set DATABASE_URL to it.
2. Run npm run prisma:migrate:deploy.
3. Run npx prisma migrate status and npx prisma validate.
4. Inspect branch_menu_assignments constraints, including the partial unique index branch_menu_assignments_one_active_default_per_branch.
5. Drop the disposable database. Never point these rehearsal commands at Staging.

Deployment order: backup the target database, deploy migration 20260925140000_add_branch_menu_assignments, deploy the API, then optionally run the QA tool manually with the explicit Staging IDs.
