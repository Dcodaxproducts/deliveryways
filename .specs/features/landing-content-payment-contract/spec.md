# Landing Content and Restaurant Payment Contract

## Problem Statement

Landing content is split between Global Settings and Landing Site Content, the
new homepage editor contains untranslated labels and raw URL inputs, and
restaurant payment selections are not authoritative on the customer checkout.
These gaps make configuration confusing and can expose methods a restaurant did
not enable.

## Goals

- [ ] Keep every marketing-site setting on Landing Site Content only.
- [ ] Upload managed landing images as files through the existing storage flow.
- [ ] Render translated labels instead of translation keys or hardcoded copy.
- [ ] Make customer checkout reflect the intersection of platform, restaurant,
      and branch payment availability.
- [ ] Explain payment categories separately from payment providers without
      changing persisted payment method codes.

## Out of Scope

| Feature                           | Reason                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------- |
| New payment-provider integrations | This change controls availability; it does not add provider SDKs or credentials. |
| Prisma payment taxonomy migration | Existing `PaymentMethod` codes remain the order/API contract.                    |
| Landing page redesign             | Public rendering already consumes managed settings.                              |

## User Stories

### P1: Consolidated landing content

**User Story**: As a Super Admin, I want all landing-site settings on one page
so that I do not have to manage related content in Global Settings.

**Acceptance Criteria**:

1. WHEN Global Settings loads THEN it SHALL not render or submit landing
   settings.
2. WHEN Landing Site Content loads THEN it SHALL expose branding, footer,
   contact, social, homepage, page content, and FAQ settings.
3. WHEN a managed image is changed THEN the UI SHALL accept an image file,
   upload it through the existing storage endpoint, and save the returned URL.

### P1: Complete localization

**User Story**: As an English or German administrator/customer, I want readable
localized labels so that raw translation keys never appear.

**Acceptance Criteria**:

1. WHEN the restaurant payment panel renders THEN it SHALL resolve every label
   from a valid EN/DE catalog namespace.
2. WHEN Landing Site Content renders THEN all UI copy SHALL come from the
   active locale catalog.
3. WHEN upload succeeds THEN the success toast SHALL resolve from an existing
   catalog key.

### P1: Authoritative restaurant payment availability

**User Story**: As a restaurant administrator, I want enabled payment methods
to control customer checkout so customers can only choose supported methods.

**Acceptance Criteria**:

1. WHEN platform, restaurant, and branch settings exist THEN the customer API
   SHALL return only methods allowed by all applicable scopes.
2. WHEN a restaurant changes its methods THEN home and branch customer
   responses SHALL reflect the change.
3. WHEN checkout renders THEN it SHALL support every configured
   `PaymentMethod` code and group methods by collection type/provider.
4. WHEN an order is submitted THEN the backend SHALL reject a method outside
   the same resolved availability contract.

## Edge Cases

- Legacy restaurant or branch settings without a method list retain safe
  defaults.
- Empty or invalid method values are ignored.
- Wallet is hidden for guests.
- Cash/card-on-delivery still respect order-type and branch switches.
- Failed image uploads leave the existing saved image unchanged.

## Requirement Traceability

| Requirement                           | Status   |
| ------------------------------------- | -------- |
| LAND-01 Consolidate landing settings  | In Tasks |
| LAND-02 Upload managed images         | In Tasks |
| I18N-01 Remove raw/missing labels     | In Tasks |
| PAY-01 Resolve scoped availability    | In Tasks |
| PAY-02 Render all configured methods  | In Tasks |
| PAY-03 Enforce availability on orders | In Tasks |
