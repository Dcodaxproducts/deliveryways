# American Corner Pilot Readiness Specification

## Problem Statement

The American Corner pilot requires production-shaped printing and domain setup instead of configuration-only placeholders. Payment and WinOrder behavior must remain intact while the missing printing and DNS workflows are completed.

## Goals

- Print an accepted order automatically through the configured QZ Tray printer without duplicate tickets.
- Support explicit A4, A5, 80 mm, and 58 mm order-ticket layouts.
- Let an authorized administrator verify a configured custom domain against the DeliveryWays DNS target before activation.
- Preserve verified Stripe, PayPal, and WinOrder contracts.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Production deployment or DNS mutation | Requires explicit deployment/infrastructure authority |
| Printer-driver installation | Remains an on-site operator responsibility |
| WinOrder SOAP catalog sync | Excluded from the REST MVP |
| Payment-flow redesign | Existing Stripe and PayPal flows are the accepted contract |

## User Stories

### P1: Accepted-order auto-printing

As a restaurant operator, I want an accepted order to print automatically so that kitchen staff receive it without a manual action.

Acceptance criteria:

1. WHEN an order first enters the accepted state and auto-print-on-status-change is enabled THEN the Restaurant Admin SHALL send one order ticket to the configured QZ printer.
2. WHEN the same order event is replayed or reconciled THEN the client SHALL not print the same trigger twice.
3. WHEN QZ Tray or the printer is unavailable THEN the client SHALL record a scoped failure and keep the order UI operational.

### P1: Paper-specific tickets

As a restaurant operator, I want to select the installed printer's paper size so that tickets are legible and correctly sized.

Acceptance criteria:

1. WHEN printing settings are saved THEN the backend SHALL accept only A4, A5, 80MM, or 58MM.
2. WHEN a ticket is printed THEN QZ SHALL receive dimensions and a layout matching the saved paper size.
3. WHEN no paper size was saved by an existing tenant THEN the system SHALL use 80MM.

### P1: Custom-domain verification

As an authorized platform administrator, I want exact DNS instructions and a verification action so that a custom storefront domain is activated only after it points to DeliveryWays.

Acceptance criteria:

1. WHEN a custom domain is configured THEN the API SHALL return the expected CNAME target and current verification state.
2. WHEN verification is requested THEN the backend SHALL resolve DNS and set `customDomainVerifiedAt` only if the domain points to the configured target.
3. WHEN DNS does not match THEN the API SHALL leave the domain unverified and return an actionable error.
4. WHEN the custom domain value changes THEN its previous verification SHALL be cleared.

### P1: Regression safety

As the platform owner, I want payment and WinOrder contracts preserved while pilot work is added.

Acceptance criteria:

1. WHEN the full backend and frontend verification surfaces run THEN Stripe, PayPal, and WinOrder tests SHALL pass unchanged.

## Edge Cases

- Multiple realtime deliveries of the same accepted order do not create multiple tickets.
- Browser reload may permit a deliberate future reprint but does not duplicate within the active session.
- DNS lookup timeouts and NXDOMAIN never activate the custom domain.
- An apex domain that cannot expose the expected CNAME remains pending and receives actionable guidance.

## Requirement Traceability

| Requirement ID | Story | Status |
| --- | --- | --- |
| PRINT-01 | Accepted-order auto-printing | Pending |
| PRINT-02 | Duplicate prevention | Pending |
| PRINT-03 | Failure reporting | Pending |
| PAPER-01 | Supported sizes | Pending |
| PAPER-02 | Size-specific layout | Pending |
| DOMAIN-01 | DNS instructions | Pending |
| DOMAIN-02 | Server-side verification | Pending |
| REG-01 | Payment and WinOrder regression safety | Pending |

