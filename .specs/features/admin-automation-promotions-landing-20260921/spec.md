# DeliveryWay Admin, Automation, Promotions, and Landing Specification

## Problem Statement

DeliveryWay currently displays the logged-in employee as a branch admin when a branch manager relation is absent, stores an auto-accept flag without enforcing it, cannot scope promotions by fulfillment type, and renders landing content and fallback packages outside Superadmin control.

## Goals

- Show only the actual assigned branch admin on branch edit.
- Confirm eligible new orders automatically when the branch setting is enabled.
- Let admins restrict promotions to pickup orders.
- Make the landing page render Superadmin-managed content and explicitly selected packages only.

## Out of Scope

- Automatic acceptance of unpaid online orders.
- Changing existing promotion eligibility unless an order-type restriction is selected.
- Deploying the changes.

## P1 User Stories and Acceptance Criteria

### ADM-01: Correct branch admin identity

WHEN a user opens a branch editor THEN the system SHALL return and display the assigned active branch admin, never the current viewer as fallback. WHEN no branch admin is assigned THEN the fields SHALL be empty.

### ORD-01: Automatic order acceptance

WHEN an eligible order becomes placed and the target branch has auto-accept enabled THEN the system SHALL transition it through the canonical confirmation workflow exactly once. WHEN payment is still pending, the setting is disabled, or the order is not placed THEN the system SHALL not auto-confirm it.

### PROMO-01: Pickup-only promotions

WHEN an admin creates or edits a promotion THEN the system SHALL allow all, delivery-only, pickup-only, or dine-in fulfillment scope. WHEN checkout order type is outside that scope THEN validation and auto-application SHALL reject or skip the promotion. Existing campaigns SHALL remain unrestricted.

### LAND-01: Managed landing content

WHEN Superadmin saves landing content THEN the public landing page SHALL render that managed home/page/footer/FAQ content and visibility settings. It SHALL not substitute hard-coded marketing copy when managed content is empty or hidden.

### LAND-02: Selected public packages only

WHEN Superadmin marks package plans for landing display THEN public landing pricing SHALL return and render only those active plans. WHEN none are selected THEN no hard-coded plans or comparison data SHALL appear.

## Edge Cases

- A legacy branch may have an active BRANCH_ADMIN user but no managerId.
- A paid order may be finalized after initial creation; auto-accept must run after payment finalization too.
- Promotion order-type scope must apply to explicit coupon validation and automatic promotions.
- Landing API failure must fail closed for managed content and packages rather than show stale hard-coded claims.

## Requirement Traceability

| Requirement | Status |
|---|---|
| ADM-01 | In Tasks |
| ORD-01 | In Tasks |
| PROMO-01 | In Tasks |
| LAND-01 | In Tasks |
| LAND-02 | In Tasks |

