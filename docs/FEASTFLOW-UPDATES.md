# FeastFlow — Major Updates and Coverage Tracker

Last updated: 22 September 2026

This is the high-level record of the work being covered in FeastFlow. It intentionally tracks product areas and major outcomes rather than every small visual or code change.

Reported defects, investigation evidence, fixes, and deployment status are tracked separately in [FEASTFLOW-ISSUES.md](./FEASTFLOW-ISSUES.md).

## Status Legend

- **Completed:** implemented, verified, and pushed.
- **Staging:** deployed and verified on FeastFlow Staging.
- **Production:** deployed and verified on FeastFlow Production.
- **Pending deployment:** implementation is ready but is not yet live in that environment.
- **Open:** identified work or acceptance still required.

## Current Release Summary

| Area                                    | Implementation       | Staging                                                                           | Production                            |
| --------------------------------------- | -------------------- | --------------------------------------------------------------------------------- | ------------------------------------- |
| Core platform/API parity                | Completed            | Deployed                                                                          | Deployment status varies by release   |
| Partner admin improvements              | Completed and pushed | Dashboard/menu, menu/orders, and metric-density refinements deployed and verified | Latest UI consistency release pending |
| Superadmin improvements                 | Completed            | Latest UI consistency release deployed                                            | Latest UI consistency release pending |
| Customer storefront                     | Live and validated   | Menu fetching verified                                                            | Existing Production release live      |
| Unified admin theme and shadcn controls | Completed and pushed | Deployed and verified                                                             | Pending deployment                    |
| Validated Staging issues batch 1        | Completed and pushed | Deployed and fully accepted; persisted-scope follow-up `c7e667e` verified         | Not deployed                          |
| Cross-app auth viewport fit             | Completed and pushed | Pending deployment                                                                | Pending deployment                    |

Latest UI consistency commits deployed to Staging:

- Partner: `4b29b52`
- Superadmin: `5368947`

Latest Partner UI refinements deployed to Staging:

- Partner: `bbe85f0`
- Partner: `cff6bdf`

Latest Partner UI refinement deployed to Staging:

- Partner: `e53e4ed`
- Partner auth-scope follow-up: `c7e667e`

Validated-issues batch 1 commits deployed to Staging:

- Platform API: `b4a3cfb`
- Partner: `9b3a296`
- Superadmin: `5f917a2`
- Customer: `1f5931a`

This release restored the protected Staging Maps configuration, enabled environment-specific SMTP delivery, added staff invitation delivery feedback, corrected Customer signup/OTP handling, improved global-settings color validation, and cleared stale Partner restaurant context. Production was not changed.

## 1. UI and Design System

### Admin design consistency

- Standardized the Partner and Superadmin panels around reusable shadcn UI primitives and Tailwind theme tokens.
- Replaced mixed browser-default controls with shared form controls, including Select, Checkbox, Input, Button, Sheet, Dialog, Dropdown, Card, and Sidebar patterns.
- Added ownership checks to prevent raw native selects from being reintroduced into admin screens.
- Set the platform admin theme color to `oklch(70.5% 0.213 47.604)` for both Staging and Production builds.
- Kept restaurant storefront branding customizable while protecting the platform admin theme from runtime restaurant overrides.

**Status:** Completed, pushed, and deployed to Staging. Production deployment remains pending.

### Navigation and sidebars

- Rebuilt Partner and Superadmin navigation using the official shadcn Sidebar system.
- Added expanded and icon-only collapsed states, tooltips, accessible labels, nested menu behavior, and responsive mobile sheets.
- Restored FeastFlow hover, active, icon, logout, and promotional-card styling on top of the shadcn structure.
- Improved menu spacing, reduced navbar height, and kept the Partner chef/help card in normal scroll flow.
- Moved the collapse control beside the sidebar in the navbar.
- Changed the mobile restaurant selector to a viewport-safe top sheet.

**Status:** Deployed and verified on Staging, including the unified theme/navbar-control sizing release.

### Dialogs, alerts, tables, and forms

- Standardized dialog and alert sizing, typography, spacing, actions, scrolling, and responsive widths.
- Reduced oversized operational dialogs while preserving validation and workflow behavior.
- Improved responsive tables and shared data views.
- Hid pagination for empty data, removed unnecessary rows-per-page controls, and only show Previous/Next when those directions are available.
- Standardized visible upload and filter controls using reusable shadcn components.

**Status:** Deployed and verified on Staging.

### Cross-app authentication viewport fit

- Customer, Partner, and Superadmin auth shells now own exactly the dynamic viewport height and suppress document-level overflow.
- Tall signup, registration, recovery, and reset forms use compact spacing and height-aware fitting so all controls remain visible on short mobile screens.
- Responsive auth actions no longer rely on widths that can exceed narrow viewports.
- Browser geometry acceptance passed 30/30 route/viewport cases at 1440×900, 390×844, and 375×667 with no page overflow and all auth cards inside viewport bounds.

**Status:** Completed and pushed in Customer `9caeb4a`, Partner `be7ed89`, and Superadmin `103727d`. Staging and Production deployment remain pending.

### Partner dashboard and menu-management consistency

- Added a reusable segmented control with explicit active and hover contrast for report ranges.
- Removed the forced full-height Revenue Trend panel so the chart follows its content instead of leaving a large empty section.
- Moved empty-result summaries from filter toolbars into the shared pagination footer.
- Consolidated Menu Overview navigation actions into a compact responsive action group with a distinct primary create action.
- Added one canonical menu-management page shell and adopted it across allergens, categories, cuisines, items, labels, modifier categories, modifier groups, modifiers, and variations.
- Removed nested title, subtitle, result-count, and section-card duplication while preserving the existing routes, permissions, queries, mutations, and modal workflows.
- Added canonical page-action and page-tab owners so Menu Management actions, navigation, and Orders tabs use one placement, size, radius, active state, and responsive behavior.
- Moved table-owned create actions into the shared page header without relocating modal state, removed Deals counts from the filter header, and normalized Deals and Orders filters to the shared control rhythm.
- Rebuilt the Orders list and order-details headers on the canonical page-header/action contracts while preserving export, printing, notification sound, scheduling, status, and fulfillment behavior.
- Standardized loaded and loading metric cards on one compact 88-pixel contract, with no more than three large cards per desktop row across Dashboard, Orders, Reports, Customers, Deliverymen, Employees, Reservations, and Loyalty.
- Removed the remaining nested Menu Management surface and repeated filter headings, compacted legacy Allergen and Variation filters, aligned Search/Reset actions, and reduced duplicate Loyalty copy and oversized controls.

**Status:** All three refinements are deployed and verified on Staging. The current Partner image is `e53e4ed`; it is healthy with zero restarts. The metric-density follow-up passed 114 suites / 1,042 tests, TypeScript, lint, the 65-route build, UI/import/i18n guards, three local/public probe rounds, and 20/20 live desktop/mobile browser checks. Production remains unchanged.

## 2. Menu and Catalog Management

- Simplified item creation so existing modifier groups are selected without redefining group-level minimum, maximum, required, or selection rules.
- Added modifier-to-modifier-group linking during modifier creation and editing.
- Clarified that modifier categories organize/filter modifiers in the admin, while modifier groups control customer selections.
- Preserved category, item, availability, image, and branch-menu workflows.
- Verified Staging customer-side fetching for restaurant context, branches, categories, menu items, item details, availability, and media.

**Status:** Workflow changes are deployed on Staging; customer data fetching is verified.

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

**Current deployment note:** The validated issue batches are deployed and accepted on Staging. Global Settings colors, stale Partner context, rejected-cart feedback, footer alignment, both custom-domain forms, and restaurant/menu-item uniqueness passed live acceptance on 17 September. Partner `c7e667e` is healthy with zero restarts; only the Partner service was recreated and the other Staging container IDs remained unchanged. Valid-provider Google completion still requires an interactive Google test identity. Production remains unchanged.

## 10. UI Modernization Phase Roadmap

The approved roadmap covers 139 routes across Partner, Superadmin, and Customer while preserving existing routes, APIs, permissions, validation, state transitions, pricing, and business flows.

| Phase   | Scope                                                                    | Status                            |
| ------- | ------------------------------------------------------------------------ | --------------------------------- |
| Phase 0 | Full UI audit, component map, and 139-route migration matrix             | Completed                         |
| Phase 1 | Shared Partner UI foundation and ownership contracts                     | Completed and consumed            |
| Phase 2 | Partner dashboard and 27 data/list routes                                | Completed and deployed to Staging |
| Phase 3 | Partner operational, detail, form, settings, and auth family (41 routes) | In progress — Tasks 1–3 complete  |
| Phase 4 | Complete Superadmin modernization (34 routes)                            | Planned                           |
| Phase 5 | Complete Customer modernization (36 routes)                              | Planned                           |
| Phase 6 | Cross-app hardening and authenticated Staging UAT                        | Planned                           |

### Active phase: Phase 3

Phase 3 covers the complete Partner operational family rather than isolated screen-polish tasks:

- Authentication and account recovery.
- Branch workspace, create/edit/detail, hours, closures, and delivery settings.
- Orders, group orders, detail/tracking, status, and payment updates.
- POS and item configuration.
- Promotion, deal, and gift-card creation/editing.
- Reports and invoices.
- Loyalty, reservations, notifications, chat, printing, and WinOrder.
- Restaurant, profile, settings, theme, payment, legal, content, FAQ, and global search screens.

The phase must reuse canonical components, preserve all existing behavior, cover all 41 mapped routes, and pass responsive, accessibility, regression, type, build, lint, and browser verification before it is considered complete.

### Phase 3 task status

1. **Completed:** audit and map all 41 routes; freeze the existing behavior contracts.
2. **Completed:** build or extend the shared form, detail, settings, field, action, and responsive-dialog components.
3. **Completed:** modernize authentication and branch-management screens.
4. **Next:** modernize Orders, POS, and payment workflows.
5. **Open:** modernize reports, promotions, integrations, and settings.
6. **Open:** run complete desktop/mobile verification before Staging.

### Task 1 — audited 41-route map

The Phase 0 migration matrix remains the membership source of truth. Task 1 revalidated that all 41 unique Phase 3 routes still exist on Partner commit `4b29b52`, and that every entry file resolves to its mapped screen owner. No route, API, permission, validation rule, price calculation, state transition, query key, service call, or workflow was changed by this audit.

|   # | Route                                        | Current screen owner                               | Family         | Phase 3 target        |
| --: | -------------------------------------------- | -------------------------------------------------- | -------------- | --------------------- |
|   1 | `/about-us`                                  | `Settings/pages/AboutUsPage.tsx`                   | Settings       | Settings layout       |
|   2 | `/auto-printing`                             | `printing/pages/AutoPrintingPage.tsx`              | Settings       | Settings layout       |
|   3 | `/branch-workspace`                          | `branches/pages/BranchWorkspacePage.tsx`           | Operation      | Workflow layout       |
|   4 | `/branches/[branchId]`                       | `Branches/pages/BranchDetailsPage.tsx`             | Detail         | Detail layout         |
|   5 | `/branches/edit`                             | `branches/pages/EditBranchPage.tsx`                | Form           | Form layout           |
|   6 | `/content-management/about`                  | `Settings/pages/AboutUsPage.tsx`                   | Settings       | Settings layout       |
|   7 | `/deliveryman/add`                           | `deliverymen/pages/AddDeliverymanPage.tsx`         | Form           | Form layout           |
|   8 | `/faqs`                                      | `settings/faqs/pages/FaqsPage.tsx`                 | Settings       | Settings layout       |
|   9 | `/faqs/add`                                  | `settings/faqs/pages/AddFaqPage.tsx`               | Form           | Form layout           |
|  10 | `/forgot-password`                           | `Auth/ForgotPasswordPage.tsx`                      | Authentication | Auth shell            |
|  11 | `/global-settings`                           | `settings/pages/GlobalSettingsPage.tsx`            | Settings       | Settings layout       |
|  12 | `/integrations/winorder`                     | `WinOrder/WinOrderSettingsPage.tsx`                | Settings       | Settings layout       |
|  13 | `/legal-profile`                             | `Settings/pages/LegalProfilePage.tsx`              | Settings       | Settings layout       |
|  14 | `/live-chat`                                 | `notifications/chat/pages/LiveChatPage.tsx`        | Operation      | Workflow layout       |
|  15 | `/login`                                     | `Auth/LoginPage.tsx`                               | Authentication | Auth shell            |
|  16 | `/loyalty`                                   | `loyalty/pages/LoyaltyPage.tsx`                    | Operation      | Workflow layout       |
|  17 | `/menu`                                      | `Menu/pages/MenuOverviewPage.tsx`                  | Operation      | Workflow layout       |
|  18 | `/menu/categories/[id]`                      | `Menu/categories/pages/CategoryDetailsPage.tsx`    | Detail         | Detail layout         |
|  19 | `/menu/deals/[id]/edit`                      | `Menu/deals/pages/EditAdminDealPage.tsx`           | Form           | Form layout           |
|  20 | `/menu/deals/add`                            | `Menu/deals/pages/AddAdminDealPage.tsx`            | Form           | Form layout           |
|  21 | `/notification-settings`                     | `notifications/pages/NotificationSettingsPage.tsx` | Settings       | Settings layout       |
|  22 | `/orders`                                    | `orders/pages/OrdersPage.tsx`                      | Operation      | Workflow layout       |
|  23 | `/orders/details/[orderId]`                  | `orders/pages/OrderDetailsPage.tsx`                | Detail         | Detail layout         |
|  24 | `/orders/group/[orderId]`                    | `orders/pages/GroupOrderDetailsPage.tsx`           | Detail         | Detail layout         |
|  25 | `/payment-settings`                          | `Settings/pages/PaymentSettingsPage.tsx`           | Settings       | Settings layout       |
|  26 | `/pos`                                       | `pos/pages/PosPage.tsx`                            | Operation      | Workflow layout       |
|  27 | `/privacy-policy`                            | `settings/pages/PrivacyPolicyPage.tsx`             | Settings       | Settings layout       |
|  28 | `/profile`                                   | `Profile/ProfilePage.tsx`                          | Detail         | Detail layout         |
|  29 | `/profile/edit`                              | `Profile/EditProfilePage.tsx`                      | Form           | Form layout           |
|  30 | `/promotion-management`                      | `promotions/pages/PromotionManagementPage.tsx`     | Operation      | Workflow layout       |
|  31 | `/promotion-management/coupons/add`          | `promotions/pages/AddCouponPage.tsx`               | Form           | Form layout           |
|  32 | `/promotion-management/gift-cards/[id]/edit` | `Promotions/gift-cards/pages/EditGiftCardPage.tsx` | Form           | Form layout           |
|  33 | `/promotion-management/gift-cards/add`       | `Promotions/gift-cards/pages/AddGiftCardPage.tsx`  | Form           | Form layout           |
|  34 | `/promotion-management/happy-hour/add`       | `promotions/pages/AddHappyHourPage.tsx`            | Form           | Form layout           |
|  35 | `/promotion-management/promotions/add`       | `promotions/pages/AddPromotionPage.tsx`            | Form           | Form layout           |
|  36 | `/register`                                  | `Auth/RegisterInfoPage.tsx`                        | Authentication | Auth shell            |
|  37 | `/reports`                                   | `reports/pages/ReportsPage.tsx`                    | Operation      | Workflow layout       |
|  38 | `/reset-password`                            | `Auth/ResetPasswordPage.tsx`                       | Authentication | Auth shell            |
|  39 | `/restaurants/add`                           | `settings/restaurants/pages/AddRestaurantPage.tsx` | Form           | Form layout           |
|  40 | `/search`                                    | `Search/SearchPage.tsx`                            | Search         | Search/results layout |
|  41 | `/theme-settings`                            | `Settings/pages/StorefrontSettingsPage.tsx`        | Settings       | Settings layout       |

Validated family totals: 4 authentication, 5 detail, 12 form, 8 operation, 11 settings/content, and 1 global-search route.

### Frozen behavior contracts for Phase 3

- **Authentication:** preserve login, registration, recovery/reset payloads, session storage, role-aware redirects, error handling, and existing validation.
- **Tenant and permissions:** preserve AppShell authentication, restaurant/branch selection, role restrictions, staff permission mapping, and tenant/restaurant/branch data scope.
- **Branches and delivery staff:** preserve create/edit payloads, opening and delivery hours, holiday overrides, temporary closures, branch-admin routing, and delivery-staff mutations.
- **Orders and POS:** preserve order/group-order state transitions, tracking, payment updates, totals, discounts, taxes, modifier pricing, item notes, and printing behavior.
- **Menu and promotions:** preserve menu/category/deal relationships, coupon/promotion/happy-hour/gift-card validation, edit identifiers, availability, branch scope, and mutation/query invalidation.
- **Reports and integrations:** preserve report calculations and filters, payout/export behavior, WinOrder connection/catalog mapping, endpoint setup, and auto-printing configuration.
- **Settings and content:** preserve profile, restaurant, theme, payment, notification, legal, FAQ, privacy, About Us, loyalty, chat, and global-search service contracts and save actions.
- **UI-only boundary:** Phase 3 may replace presentation shells and reusable components, but domain hooks, services, API endpoints, request/response shapes, pricing helpers, and state machines remain unchanged unless separately approved.

### Task 2 — shared Phase 3 UI foundation

Partner commit `8770f62` adds the canonical presentation layer required by the audited Phase 3 routes:

- `FormLayout`, `FormSection`, and `FormActions` for responsive form bodies, optional previews, typed field grids, disclosures, and mobile/sticky action regions.
- An extended `FormField` render contract that supplies stable IDs, required state, invalid state, and help/error relationships directly to controls.
- `DetailLayout`, `DetailPanel`, and `InfoList` for summary/main/sidebar composition and semantic label/value metadata.
- `SettingsLayout` for section navigation, content, live save status, and sticky actions.
- `ResponsiveDialog` for one controlled contract rendered as a desktop Dialog or mobile Sheet, with shared headers, scrollable bodies, actions, sizes, and pending-action dismissal protection.
- An extended `ConfirmDialog` with busy labels, inline errors, loading feedback, and dismissal protection while a mutation is pending.
- Ownership enforcement and documentation so parallel form, detail, and information-list owners cannot be added; the old `ModalActions` name now resolves to canonical `FormActions`.

The foundation is UI-only and is not deployed independently. Authentication, branch, order, POS, menu, pricing, promotion, reporting, integration, permission, tenant, and API behavior remain unchanged. Task 3 consumes these components across the authentication and branch-management route family.

### Task 3 — authentication and branch management

Partner commit `e01f3c8` modernizes the seven mapped authentication and branch-management routes:

- `/login`, `/forgot-password`, `/reset-password`, and `/register` now share one accessible, responsive `AuthPageShell`, `AuthCard`, and FeastFlow brand treatment with consistent controls, focus states, actions, and mobile/desktop composition.
- `/branch-workspace` uses the canonical page header and section-card presentation while preserving the assigned-branch scope banner, branch-only navigation, refresh behavior, and branch card restrictions.
- `/branches/[branchId]` consumes `DetailLayout`, `DetailPanel`, and semantic `InfoList` owners while preserving branch, restaurant, manager, address, order-type, metric, and holiday-hours queries and values.
- `/branches/edit` consumes `PageHeader`, `FormLayout`, `FormActions`, and `SectionCard`, retaining its three-step form, branch-admin redirect guard, validation, payload mapping, notification update, delivery settings, working-hours mutation, and step transitions.
- Focused regression guards cover canonical-owner adoption plus frozen authentication, redirect, branch-scope, query, and mutation contracts.

Verification passed 114 suites and 1,037 tests, TypeScript, the 65-route Production build, exact-case imports, 3,322-key i18n parity, shared-UI ownership, diff checks, and lint with zero errors and 95 inherited warnings in untouched files. Visible desktop/mobile browser acceptance passed eight authentication views and six protected-route redirects without page errors or horizontal overflow. This change is pushed but not deployed; API, database, environment files, Staging, and Production remain unchanged.

### Tasks 4–5 — Orders, POS, Payments, Reports, and Promotions

Partner commits `9cc0a6e` and `b485209` modernize Orders, Order Details, Group Orders, POS, Payments, Reports, coupons, promotions, happy hours, and gift cards with the canonical page, tab, filter, detail, state, form, dialog, action, button, and badge contracts. Domain hooks, routes, permissions, report export, tenant scope, API contracts, and mutation behavior remain unchanged. The coupon view now uses live data instead of hard-coded KPI values and provides explicit loading, error, empty, table, and mobile-card states.

The cumulative Partner head `b485209` was deployed to Staging on 2026-09-17 as an immutable non-root image. Only the Partner service was recreated; API, PostgreSQL, Customer, Superadmin, and Production remained unchanged. The container is healthy with zero restarts, three local/public probe rounds passed, recent logs are clean, and 30/30 desktop/mobile browser checks passed across Orders, Order Details, Group Orders, POS, Payments, Reports, promotion tabs, coupon/promotion/happy-hour forms, and gift cards without browser errors or horizontal overflow. Release and exact-image rollback overlays are stored under `/opt/feastflow/releases/staging/20260917-partner-phase3-modernization*.compose.yml`.

### Responsive control and navigation follow-up

Partner commit `e589163` standardizes responsive filter actions, tabs, metric cards, sidebar expansion, Orders navigation ownership, and POS density. Shared `FilterActions`, `FilterBar`, `PageTabs`, and `SegmentedControl` contracts prevent Search/Reset clipping, undersized buttons, overlapping controls, and wrapped tab labels. Labels and Allergens use the canonical compact metric card; expanded sidebar groups scroll into view; Orders has one sidebar destination with subviews owned by page tabs; POS reuses the compact shared card/layout system.

The cumulative commit was deployed to Staging on 2026-09-17 as immutable non-root image `sha256:1a099d35955bcf775368b30d35340ac5e3260090dd24217afc4349832e4d4623`. Only Partner was recreated; API, PostgreSQL, Customer, Superadmin, and Production remained unchanged. Partner is healthy with zero restarts, the full Staging smoke test and three local/public probe rounds passed, logs are clean, and the exact live bundle passed 18/18 desktop/mobile checks across Menu, Reservations, Orders, and POS with no overflow, clipped actions, narrow buttons, wrapped tabs, duplicate Orders navigation, sidebar visibility failures, or browser errors. Release and exact-image rollback overlays are stored under `/opt/feastflow/releases/staging/20260917-partner-responsive-ui-consistency*.compose.yml`.

## 11. Current Priorities

1. Run authenticated business acceptance for the updated Partner workflows on Staging, including real order, POS, payment, report, and promotion data.
2. Complete valid-provider Google sign-in acceptance with an interactive Google test identity.
3. Promote approved cumulative releases to Production with ancestry, backup, rollback, smoke, and browser proof.

## Maintenance Rule

Update this document when a major capability, product area, deployment state, or open risk changes. Do not add individual spacing tweaks, copy edits, single test cases, image hashes, or routine commit details unless they materially change release status.

## Storefront Ordering and Deal-ticket Clarity — 22 September 2026

Status: deployed and verified on Staging. Production unchanged.

- Customer category cards now follow the same configured ascending category order shown in Partner Admin, including paginated menus.
- Partner HTML and ESC/POS tickets now render grouped deal components from the canonical `displayItems` response and add a visible `DEAL: Deal` boundary before the first component.
- WinOrder retains exact main-article names and numbers while adding a supported comment-only `Deal-Artikel` marker to deal components, protecting productive article matching while making deal context visible.
- The changes are cumulative with the 22 September authentication viewport improvements already present on the same Partner and Customer branches.

Release commits: Platform API `682ac77`, Partner `d589aee`, Customer `4d41a11`.

Staging runs cumulative immutable images from Platform API `581dc4c`, Partner `d589aee`, and Customer `4d41a11`. The rollout passed restore-tested backup, committed migrations, health checks, official localhost smoke tests, three public HTTPS rounds, live category-order verification, and zero-restart/error-log checks. PostgreSQL and Superadmin containers remained unchanged. Release manifest: `/opt/feastflow/releases/staging/20260922T074042Z.env`.
