# FeastFlow Reported Issues Batch 3 Specification

## Problem Statement

The final five items in the 15-item Staging report remain unresolved: duplicate restaurant names, duplicate menu-item names, optional interactive guest names, incomplete Google customer sign-in/account creation, and a missing Customer favicon. The fixes must preserve tenant boundaries and existing anonymous cart sessions.

## Goals

- [x] Prevent new active restaurant-name duplicates within one tenant.
- [x] Prevent new active menu-item-name duplicates within one restaurant.
- [x] Require a name when a person explicitly chooses "Continue as guest".
- [x] Let a verified Google identity sign in to, or create, a customer account only for the selected restaurant.
- [x] Serve a valid default Customer favicon while retaining restaurant branding overrides.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Renaming/deleting existing duplicate Staging records | Destructive product-data decision requires separate approval. |
| Global restaurant-name uniqueness | Restaurant names are tenant-owned. |
| Cross-restaurant Google account linking | Customer accounts are restaurant-scoped. |
| Changing Google OAuth provider credentials | Existing protected Staging credentials are configured. |
| Staging deployment | Requires a separately approved, rollback-ready release. |

## User Stories

### P1: Scoped restaurant-name uniqueness

As a tenant administrator, I want active restaurant names to be unique inside my tenant so restaurant selection is unambiguous.

Acceptance criteria:

1. WHEN an active restaurant is created with a case-insensitive matching active name in the same tenant THEN the API SHALL return a readable validation error.
2. WHEN a restaurant is renamed to such a name THEN the API SHALL return the same validation error.
3. WHEN the same name exists only in another tenant or only on a deleted restaurant THEN the API SHALL allow it.

### P1: Scoped menu-item-name uniqueness

As a restaurant operator, I want active menu-item names to be unique inside one restaurant so menu administration is unambiguous.

Acceptance criteria:

1. WHEN a single or bulk create repeats an active name in the restaurant THEN the API SHALL reject it with a readable validation error.
2. WHEN an item is renamed to an existing active name THEN the API SHALL reject it.
3. WHEN an item is duplicated THEN the API SHALL generate a unique copy name rather than create a duplicate name.
4. WHEN the same name exists only in another restaurant or a deleted item THEN the API SHALL allow it.

### P1: Required interactive guest name

As a guest customer, I want my entered identity retained so the storefront can address me consistently.

Acceptance criteria:

1. WHEN a user explicitly continues as guest THEN the form and API SHALL require a nonblank first name.
2. WHEN the storefront creates a technical guest cart session THEN it SHALL explicitly use the existing generic Guest Customer identity so cart behavior remains compatible.
3. WHEN a name is missing from the interactive form THEN the UI SHALL show localized validation and SHALL NOT call the API.

### P1: Restaurant-scoped Google customer sign-in

As a customer, I want Google sign-in to work whether or not I previously created a password account at the selected restaurant.

Acceptance criteria:

1. WHEN a verified Google email matches a customer in the selected restaurant THEN the API SHALL sign in that customer.
2. WHEN no matching account exists in that restaurant THEN the API SHALL create a verified, approved customer there using verified Google identity data and sign it in.
3. WHEN the same email belongs to another restaurant THEN the API SHALL NOT link across restaurant boundaries.
4. WHEN the Google token is invalid, unverified, or has a disallowed audience THEN the API SHALL reject it.

### P1: Customer favicon

As a storefront visitor, I want the browser to receive a valid icon instead of a 404.

Acceptance criteria:

1. WHEN `/favicon.ico` is requested THEN the Customer build SHALL return a valid icon.
2. WHEN restaurant branding is available THEN the existing runtime favicon override SHALL remain functional.

## Edge Cases

- Existing duplicate Staging names remain grandfathered; editing either record to a colliding name is rejected.
- Case differences and surrounding input whitespace do not bypass uniqueness checks.
- Bulk payloads cannot duplicate names within the payload itself.
- Google display names without a family name remain valid.
- Google sign-in never creates admin, staff, or cross-restaurant accounts.

## Requirement Traceability

| Requirement ID | Requirement | Status |
| --- | --- | --- |
| B3-REST-01 | Tenant-scoped restaurant-name validation | Verified |
| B3-MENU-01 | Restaurant-scoped menu-item-name validation | Verified |
| B3-GUEST-01 | Required interactive guest name with technical-session compatibility | Verified |
| B3-GOOGLE-01 | Scoped Google sign-in and customer provisioning | Verified |
| B3-ICON-01 | Valid default favicon and preserved branding override | Verified |

## Success Criteria

- [x] All affected focused tests pass.
- [x] Full API and Customer verification pass.
- [x] Existing Staging records are not mutated.
- [x] Source commits and the dedicated issue tracker accurately distinguish source-fixed from deployed status.
