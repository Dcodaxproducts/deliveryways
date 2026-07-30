# Localized Customer Email Templates Specification

## Problem Statement

DeliveryWay customer emails are hardcoded English plaintext. Super Admin can
configure notification channels and a platform default language, but cannot
manage transactional email wording, and registered customer locale is not
persisted for later order-status emails.

## Goals

- [ ] Let Super Admin edit German and English customer email templates.
- [ ] Render customer emails using customer locale with deterministic fallback.
- [ ] Send German order confirmations with complete order details by default.
- [ ] Replace the Restaurant Admin login marketing sentence with welcome copy.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Arbitrary HTML/CSS email designer | Text templates are safer and sufficient for this request. |
| Restaurant-specific template overrides | Templates are platform-owned by Super Admin. |
| SMS/WhatsApp template editing | The request is specifically about email. |
| Database schema migration | Existing global-settings and profile metadata JSON can persist this data. |

## User Stories

### P1: Super Admin manages localized templates

**User Story**: As Super Admin, I want to edit German and English subjects and
bodies for customer transactional emails.

**Acceptance Criteria**:

1. WHEN Super Admin opens Notification Settings THEN the system SHALL show
   templates for verification, password reset, order confirmation, order
   status, payment status, and gift cards.
2. WHEN Super Admin saves a template THEN the system SHALL persist both locales
   in global notification settings.
3. WHEN a template uses an unsupported placeholder THEN the API SHALL reject it.

### P1: Customer-locale delivery

**User Story**: As a customer, I want emails in my selected storefront language.

**Acceptance Criteria**:

1. WHEN an authenticated customer selects a locale THEN the system SHALL save it
   in profile metadata.
2. WHEN a customer email is rendered THEN locale selection SHALL use saved
   customer locale, then platform default, then German.
3. WHEN an existing customer has no saved locale THEN the email SHALL be German.

### P1: Detailed German order confirmation

**Acceptance Criteria**:

1. WHEN an order is placed THEN the confirmation SHALL include order number,
   branch, order type, item lines, subtotal, tax, delivery fee, discount, and
   final total.
2. WHEN the resolved locale is German THEN subject, labels, and status wording
   SHALL be German.
3. WHEN Super Admin customizes the order template THEN validated variables SHALL
   render into the customized text.

### P2: Restaurant Admin welcome copy

**Acceptance Criteria**:

1. WHEN the login page renders in German or English THEN it SHALL show concise
   welcome copy and SHALL NOT show the former SaaS marketing sentence.

## Requirement Traceability

| Requirement ID | Requirement | Status |
| --- | --- | --- |
| EMAIL-01 | Persist DE/EN templates in global settings | In Design |
| EMAIL-02 | Validate and render template variables | In Design |
| EMAIL-03 | Persist and resolve customer locale | In Design |
| EMAIL-04 | Localize verification/reset/order/payment/gift-card emails | In Design |
| ORDER-01 | Include complete order details | In Design |
| LOGIN-01 | Replace login marketing sentence | In Design |

## Success Criteria

- [ ] Super Admin can save and reload all supported templates.
- [ ] German and English rendering tests pass.
- [ ] Order confirmation assertions cover item and amount detail.
- [ ] No migration is introduced.

