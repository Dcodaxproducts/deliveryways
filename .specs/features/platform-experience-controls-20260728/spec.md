# DeliveryWay Platform Experience Controls — 2026-07-28

## Problem Statement

Order placement is coupled to slow email delivery, important marketing content is hardcoded, promotion visibility cannot distinguish permanent customers from guests, invoice documents are not consistently actionable, and restaurant operations lack branch-specific order-email routing and a compact orders view.

## Goals

- [ ] Return successful order placement without waiting for SMTP delivery.
- [ ] Let Superadmin manage the complete marketing homepage in English and German, including featured restaurants.
- [ ] Let campaign creators target guests, registered customers, or both.
- [ ] Complete generated-invoice history access and document actions.
- [ ] Add branch-specific new-order email routing and compact Restaurant Admin order UI.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Redesigning the landing page | Existing visual structure remains; only its content/data becomes managed. |
| Replacing SMTP with a new provider | This batch removes SMTP from the request latency path but preserves the configured mail transport. |
| Changing invoice accounting calculations | Existing generated invoice amounts and schedules remain authoritative. |
| Removing customer information from order details | Only the Orders list column is removed. |

## User Stories

### P1: Fast order placement

**User Story**: As a customer, I want order placement to complete after the order is persisted so that slow SMTP does not block checkout.

**Acceptance Criteria**:

1. WHEN an order is persisted successfully THEN the API SHALL return without waiting for outbound email delivery.
2. WHEN post-order notification delivery fails THEN the order SHALL remain successful and the failure SHALL be logged/recorded.
3. WHEN an order is placed THEN Restaurant Admin realtime and in-app notification behavior SHALL remain available.

**Independent Test**: A delayed mailer mock does not delay the order-create response, while the order and notification side effect are initiated.

### P1: Managed marketing homepage

**User Story**: As a Superadmin, I want to manage homepage sections so that Landing content changes do not require a code deployment.

**Acceptance Criteria**:

1. WHEN Superadmin edits homepage content THEN the system SHALL support English and German text, images, CTA labels/links, visibility, and ordering for the existing homepage sections.
2. WHEN Superadmin selects featured restaurants THEN the Landing partner section SHALL show only active selected restaurants with their current names/logos and valid storefront links.
3. WHEN a managed field is empty THEN Landing SHALL preserve the current localized content as a backward-compatible fallback.
4. WHEN managed content is saved THEN the public landing-settings response SHALL expose only sanitized public fields.

**Independent Test**: Update hero, featured restaurants, one checklist section, and app-download content in Superadmin and observe the public Landing homepage without changing source constants.

### P1: Promotion audience targeting

**User Story**: As a campaign creator, I want to target guests, registered customers, or both so that promotions appear and apply only to the intended audience.

**Acceptance Criteria**:

1. WHEN creating or editing a deal/promotion THEN Restaurant Admin SHALL offer `Guests`, `Registered customers`, and `Both`.
2. WHEN no audience exists on a historical campaign THEN the system SHALL treat it as `Both`.
3. WHEN a guest requests or applies a registered-only campaign THEN the system SHALL hide/reject it.
4. WHEN a registered customer requests or applies a guest-only campaign THEN the system SHALL hide/reject it.
5. WHEN Superadmin/Restaurant Admin lists campaigns THEN the selected audience SHALL be returned for display/editing.

**Independent Test**: Create one campaign per audience and verify anonymous/silent-guest and permanent-customer visibility plus checkout enforcement.

### P1: Invoice history and documents

**User Story**: As a Superadmin or Restaurant Admin, I want generated invoice history with document actions so that I can review and download applicable invoices.

**Acceptance Criteria**:

1. WHEN Superadmin views generated invoice history THEN each invoice with an available document SHALL have a view/download action.
2. WHEN Restaurant Admin opens invoice history THEN only authorized restaurant/branch invoices SHALL be listed and actionable.
3. WHEN an invoice document is unavailable THEN the action SHALL be disabled with a clear state rather than failing silently.

**Independent Test**: Open an invoice from Superadmin history and download an authorized order invoice from Restaurant Admin history.

### P1: Branch order-email routing

**User Story**: As a Branch Admin, I want a branch-specific order notification email so that new orders reach the correct branch inbox.

**Acceptance Criteria**:

1. WHEN an authorized Branch Admin saves an order notification email THEN it SHALL be stored only in that branch’s settings.
2. WHEN a new order belongs to a branch with email enabled/configured THEN that branch email SHALL receive the new-order email.
3. WHEN the branch has no configured order email THEN restaurant-level new-order email settings SHALL remain the fallback.
4. WHEN a Branch Admin targets another branch THEN the API SHALL reject the request.

**Independent Test**: Configure a branch address, place an order for that branch, and verify the resolved recipient prefers the branch address.

### P2: Compact Restaurant Admin orders UI

**User Story**: As a Restaurant Admin, I want a compact order list and shorter browser title so that the operational screen is easier to scan.

**Acceptance Criteria**:

1. WHEN Restaurant Admin pages render THEN the browser/application title SHALL omit `DeliveryWay`.
2. WHEN the Orders table renders THEN the Customer Info column SHALL not appear.
3. WHEN order details render THEN customer information SHALL remain available.

**Independent Test**: Inspect the browser tab and desktop/mobile Orders list, then open an order detail.

## Edge Cases

- Existing landing settings and campaigns must continue to deserialize without the new fields.
- Deleted/inactive restaurants selected earlier must not render as featured.
- Anonymous requests and authenticated silent-guest users both count as `Guests`.
- Notification email failure must not roll back or change a successfully placed order.
- Branch email addresses must be normalized and validated.
- Invoice actions must preserve tenant, restaurant, and branch authorization.

## Requirement Traceability

| Requirement ID | Story | Status |
| --- | --- | --- |
| ORD-PERF-01 | Fast order placement | Task 1.1 |
| LAND-HOME-01 | Managed homepage content | Task 3.1–3.4 |
| LAND-HOME-02 | Featured restaurants | Task 3.1–3.4 |
| PROM-AUD-01 | Audience create/edit | Task 2.1–2.2 |
| PROM-AUD-02 | Audience visibility/application | Task 2.3–2.4 |
| INV-HIST-01 | Superadmin document actions | Task 4.1–4.2 |
| INV-HIST-02 | Restaurant Admin scoped history | Task 4.1, 4.3 |
| NOTIF-BR-01 | Branch email configuration | Task 1.2, 5.3 |
| NOTIF-BR-02 | Branch-first recipient resolution | Task 1.3 |
| ADMIN-UI-01 | Short title | Task 5.1 |
| ADMIN-UI-02 | Remove customer list column | Task 5.2 |

**Coverage**: 11 total, 11 mapped to tasks, 0 unmapped.

## Success Criteria

- [ ] SMTP latency is outside the synchronous order-create response path.
- [ ] Every requested homepage screenshot section can be managed by Superadmin.
- [ ] Campaign audience is enforced in browse, quote, and checkout paths.
- [ ] Authorized invoice histories expose working document actions.
- [ ] Branch email routing and compact Orders UI pass focused regression tests.
