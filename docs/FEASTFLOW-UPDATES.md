# FeastFlow — Major Updates and Coverage Tracker

Last updated: 14 September 2026

This is the high-level record of the work being covered in FeastFlow. It intentionally tracks product areas and major outcomes rather than every small visual or code change.

## Status Legend

- **Completed:** implemented, verified, and pushed.
- **Staging:** deployed and verified on FeastFlow Staging.
- **Production:** deployed and verified on FeastFlow Production.
- **Pending deployment:** implementation is ready but is not yet live in that environment.
- **Open:** identified work or acceptance still required.

## Current Release Summary

| Area | Implementation | Staging | Production |
|---|---|---|---|
| Core platform/API parity | Completed | Deployed | Deployment status varies by release |
| Partner admin improvements | Completed | Deployed through the mobile top-sheet release | Latest UI consistency release pending |
| Superadmin improvements | Completed | Deployed through pagination/responsive refinements | Latest UI consistency release pending |
| Customer storefront | Live and validated | Menu fetching verified | Existing Production release live |
| Unified admin theme and shadcn controls | Completed and pushed | Pending deployment | Pending deployment |

Latest UI consistency commits awaiting deployment:

- Partner: `4b29b52`
- Superadmin: `5368947`

## 1. UI and Design System

### Admin design consistency

- Standardized the Partner and Superadmin panels around reusable shadcn UI primitives and Tailwind theme tokens.
- Replaced mixed browser-default controls with shared form controls, including Select, Checkbox, Input, Button, Sheet, Dialog, Dropdown, Card, and Sidebar patterns.
- Added ownership checks to prevent raw native selects from being reintroduced into admin screens.
- Set the platform admin theme color to `oklch(70.5% 0.213 47.604)` for both Staging and Production builds.
- Kept restaurant storefront branding customizable while protecting the platform admin theme from runtime restaurant overrides.

**Status:** Completed and pushed; latest theme/control release is pending deployment.

### Navigation and sidebars

- Rebuilt Partner and Superadmin navigation using the official shadcn Sidebar system.
- Added expanded and icon-only collapsed states, tooltips, accessible labels, nested menu behavior, and responsive mobile sheets.
- Restored FeastFlow hover, active, icon, logout, and promotional-card styling on top of the shadcn structure.
- Improved menu spacing, reduced navbar height, and kept the Partner chef/help card in normal scroll flow.
- Moved the collapse control beside the sidebar in the navbar.
- Changed the mobile restaurant selector to a viewport-safe top sheet.

**Status:** Deployed and verified on Staging, except the latest unified theme/navbar-control sizing release.

### Dialogs, alerts, tables, and forms

- Standardized dialog and alert sizing, typography, spacing, actions, scrolling, and responsive widths.
- Reduced oversized operational dialogs while preserving validation and workflow behavior.
- Improved responsive tables and shared data views.
- Hid pagination for empty data, removed unnecessary rows-per-page controls, and only show Previous/Next when those directions are available.
- Standardized visible upload and filter controls using reusable shadcn components.

**Status:** Deployed and verified on Staging.

## 2. Menu and Catalog Management

- Simplified item creation so existing modifier groups are selected without redefining group-level minimum, maximum, required, or selection rules.
- Added modifier-to-modifier-group linking during modifier creation and editing.
- Clarified that modifier categories organize/filter modifiers in the admin, while modifier groups control customer selections.
- Preserved category, item, availability, image, and branch-menu workflows.
- Verified Staging customer-side fetching for restaurant context, branches, categories, menu items, item details, availability, and media.

**Status:** Workflow changes are deployed on Staging; customer data fetching is verified.

**Open data item:** the Staging `Extra Burger Toppings` group is linked to an item but currently contains no modifiers. This is catalog configuration, not an API-fetch failure.

## 3. Admin Access, Reporting, and Business Visibility

- Enabled authorized platform staff using the Superadmin panel with all-restaurants access to see global restaurant, successful-order, and revenue totals.
- Added platform-currency support for revenue presentation.
- Added explicit error states so failed overview requests are not displayed as misleading empty or zero totals.
- Preserved restaurant, branch, role, and permission boundaries for non-global users.
- Improved reporting and dashboard behavior so cached/known values are not silently replaced with false zero values after request failures.

**Status:** Deployed and verified on Staging. Production rollout must be tracked per release.

## 4. Orders and External Integrations

- Improved WinOrder payload compatibility, including delivery-type values, address formatting, modifier price handling, and item-note export.
- Prevented modifier prices from being counted twice in WinOrder exports.
- Preserved existing order, payment, invoice, coupon, and reporting workflows while syncing verified platform parity fixes.
- Maintained Stripe environment separation and guarded deployment checks.

**Status:** WinOrder parity is deployed on Staging. Production rollout must be tracked per release.

## 5. Customer Storefront

- Verified restaurant-domain resolution and branch/menu data loading on Staging.
- Verified category, item-list, item-detail, modifier, availability, currency, and image responses against the rendered customer UI.
- Checked desktop and mobile rendering for API failures, page errors, and horizontal overflow.
- Preserved customizable restaurant storefront branding independently from the admin-panel theme.

**Status:** Staging customer menu fetching is working correctly.

**Open minor item:** the customer favicon currently returns 404 on Staging.

## 6. Performance and Accessibility

- Reduced Partner login image payload by replacing the large JPG banner with an optimized WebP asset.
- Consolidated Superadmin font loading to reduce font requests and transferred bytes.
- Improved loading, retry, error, empty, and cached-data states across business screens.
- Improved responsive layouts and removed horizontal-overflow regressions across representative desktop, tablet, and mobile sizes.
- Added semantic labels, keyboard/focus states, tooltips, accessible menu controls, and responsive interaction targets.

Measured foundation improvements included:

- Partner login accessibility: 90 to 100.
- Partner login payload: approximately 1,080 KiB to 657 KiB.
- Superadmin login accessibility: 88 to 100.
- Superadmin font loading: 14 requests / 197 KB to 1 request / 34 KB.
- Layout shift remained at zero in the measured login checks.

**Status:** Foundation improvements completed; performance remains a continuing release criterion.

## 7. Security, Tenancy, and Data Safety

- Keep tenant-scoped access behind the established tenant context and authorization boundaries.
- Preserve role, panel, restaurant, and branch permissions during UI and API changes.
- Avoid exposing secrets or private authentication fields through public configuration endpoints.
- Use environment-specific provider credentials and keep Staging/Production secrets outside source control.
- Require database backup and migration-status checks before database-affecting deployments.
- Require deployed-commit ancestry checks so a release cannot silently remove already-live fixes.

**Status:** Ongoing mandatory release baseline.

## 8. Testing and Quality Gates

Major FeastFlow updates are expected to pass the relevant proof surface:

- TypeScript type checking.
- Production build.
- Automated unit/component/regression tests.
- Lint with zero new errors.
- UI ownership, import-case, and internationalization checks.
- Desktop and mobile browser acceptance.
- API/public-route smoke tests.
- Container health, restart, log, and service-isolation checks after deployment.
- Migration status and verified backup when API/database changes are included.

Recent Partner and Superadmin releases have passed these gates before being pushed or deployed.

## 9. Deployment and Operations

- FeastFlow has separate Staging and Production environments.
- Frontend and API images are built as immutable, revision-labelled images and run as non-root containers.
- Deployments recreate only the services included in the approved release.
- Rollback overlays are prepared before changing live containers.
- Staging changes are smoke-tested through localhost, public endpoints, repeated health probes, logs, and browser checks.
- Production is never assumed from a Staging deployment; it requires its own approval and verification.

**Current deployment note:** the latest Partner and Superadmin UI consistency commits are pushed but not yet deployed to Staging or Production.

## 10. Current Priorities

1. Deploy and verify the unified admin theme/shadcn consistency release on Staging.
2. Run authenticated business acceptance for the updated Partner and Superadmin workflows.
3. Promote approved cumulative releases to Production with ancestry, backup, rollback, smoke, and browser proof.
4. Populate or unlink the empty Staging modifier group so customer customization summaries match usable options.
5. Fix the missing customer favicon.
6. Continue replacing any remaining one-off UI patterns with shared shadcn-based components when those screens are touched.

## Maintenance Rule

Update this document when a major capability, product area, deployment state, or open risk changes. Do not add individual spacing tweaks, copy edits, single test cases, image hashes, or routine commit details unless they materially change release status.
