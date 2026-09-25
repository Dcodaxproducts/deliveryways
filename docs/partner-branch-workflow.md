# Partner branch workflow operations

## QA fixture

Run key: qa-partner-branch-v1-20260925. The tool requires explicit QA_TENANT_ID and QA_RESTAURANT_ID and verifies that relationship before work. It has not been run against Staging.

- npm run qa:partner-branch -- dry-run: validate scope and print stable IDs without mutation.
- apply: preflights every fixed ID/slug/compound key, rejects anything not positively owned by this run, writes a hashed pre-change manifest, then applies one transaction. Reapply is allowed only while restaurant branding still matches the original or applied hash.
- verify: exact tenant/restaurant-scoped fixture counts.
- rollback: requires matching snapshot/applied hashes and ownership markers, refuses restoration after legitimate branding edits, and applies tenant + run-key guards to every exact-ID deletion.

Optional QA_MANIFEST_PATH chooses the operator-controlled snapshot path. Fixtures include synthetic branding, North active and Riverside inactive branches, two menus, catalog/category and item overrides, and a synthetic contact submission. Orders are deliberately omitted because the schema requires an existing customer; the tool never attaches data to an unknown Staging user. No credentials or real PII are stored.

## Migration rehearsal (scratch only)

1. Create a disposable PostgreSQL database and set DATABASE_URL to it.
2. Run npm run prisma:migrate:deploy.
3. Run npx prisma migrate status and npx prisma validate.
4. Inspect branch_menu_assignments constraints, including the partial unique index branch_menu_assignments_one_active_default_per_branch.
5. Drop the disposable database. Never point these rehearsal commands at Staging.

Deployment order: backup the target database, deploy migration 20260925140000_add_branch_menu_assignments, deploy the API, then optionally run the QA tool manually with the explicit Staging IDs.

## Branch menu API contract

GET and PUT /branches/:branchId/menus return canonical data fields branchId, menuIds, and defaultMenuId. The richer assignments array remains additive. PUT accepts menuIds plus defaultMenuId and serializes replacements with a branch row lock. Reads include tenant, restaurant, branch, active-assignment, active-branch, and active/non-deleted-menu scope.

Branch suspend and soft-delete lock all current restaurant branches and revalidate inside the transaction before enforcing the main/default and last-active protections.
