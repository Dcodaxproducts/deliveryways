# DeliveryWays Localization / Translation Spec

## Scope
Add restaurant/catalog localization without breaking existing request payloads, stored default data, or customer/admin response flows.

## Current State
- Platform global settings already store `defaultLanguage` and `isLocalizationEnforced`.
- Customer/public catalog endpoints do not accept a language/locale query yet.
- Translatable catalog text is currently stored directly on domain records:
  - `Restaurant`: `name`, `tagline`, `bio`
  - `Branch`: `name`, `description`
  - `RestaurantMenu`: `name`, `description`
  - `MenuCategory`: `name`, `description`
  - `MenuItem`: `name`, `description`, `ingredients`, `nutritionalInformation`
  - `MenuItemVariation`: `name`, `description`
  - `ModifierGroup`: `name`, `description`
  - `Modifier`: `name`
  - `Coupon`: `title`, `description`
  - settings JSON labels/templates: product labels, allergens/additives, FAQ/customer app copy

## Requirements
- LOC-001: Existing create/update APIs must continue accepting current default-language fields.
- LOC-002: Existing list/detail/customer responses must remain unchanged when no language is requested.
- LOC-003: A requested locale must only override display text fields that have translations.
- LOC-004: Missing translations must fall back to the existing default field value.
- LOC-005: Translation storage must be restaurant/tenant scoped to avoid cross-tenant leakage.
- LOC-006: Translation writes must validate entity ownership before saving.
- LOC-007: Translation reads must never change pricing, availability, scheduling, branch override, promotion, cart, or order logic.
- LOC-008: Customer-facing endpoints should support locale through a query/header strategy without requiring frontend request body changes.
- LOC-009: Admin APIs should expose translation upsert/read/delete flows for supported entities.
- LOC-010: Tests must cover default language, translated language, partial translation fallback, and wrong-restaurant access.

## Non-Goals For First Phase
- Automatic machine translation.
- Translating order snapshots after checkout.
- Rewriting existing slugs per language.
- Replacing existing default-language columns.
- Enforcing localization globally before the fallback path is proven.

## Open Decisions
- Supported languages list: confirm initial locale set, likely `en`, `ar`, and `de` if matching frontend needs.
- Locale source precedence: proposed order is explicit `?locale=`, then `Accept-Language`, then global default.
- Translation status: proposed first phase stores translations as active immediately; add draft/published only if admin workflow needs it.
