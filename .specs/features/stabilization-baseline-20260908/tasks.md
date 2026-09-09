# Tasks

- [x] Capture current Production release manifest, runtime containers, image tags, image IDs, and restart/health state.
- [x] Resolve every Production image tag to a full source commit.
- [x] Prove each Production commit contains its repository's `origin/main` history.
- [x] Capture Staging release refs and explain API history divergence.
- [x] Inventory rollback scripts, prior release manifests, database backups, and Nginx rollback assets.
- [x] Define the permanent environment and domain boundaries.
- [x] Inventory critical API controllers, global guards, tenant discovery, roles, response envelope, WebSocket events, and database models.
- [x] Inventory Partner, Superadmin, and storefront UI routes.
- [x] Inventory current automated tests and identify missing end-to-end protection.
- [x] Create and push immutable Production tags and non-rewritten release branches in all four application repositories.
- [x] Run documentation checks and inspect the final diff.
- [x] Commit and push this baseline package.
- [x] Capture the durable handoff in GBrain.

## Next package (not part of this change)

- Add Superadmin regression tests for login, dashboard, tenant approval, package/subscription management, settings, and logout.
- Add isolated-database end-to-end acceptance coverage for the P0 flows in the matrix.
- Add repository CI gates for typecheck, lint, tests, Production build, and contract checks.
