# Menu Variation + Modifier Pricing Spec

## Summary
Align menu modeling with the intended restaurant flow: categories own variations, menus own scheduling, items can use single or multiple pricing, modifier groups can attach at category level, and addon pricing must be able to vary by selected variation (for example, Small extra cheese vs Large extra cheese).

## Current State
- `MenuItemVariation` already belongs to `MenuCategory`, not `MenuItem`.
- `MenuItemVariation` already supports `description`, `sku`, `price`, `isDefault`, and `isActive`.
- `RestaurantMenu` already supports `isTimed` and `timingConfig` for menu scheduling.
- `MenuItem` already supports `pricingMode`, `basePrice`, `deliveryPriceAdjustment`, and `takeawayPriceAdjustment`.
- `ModifierGroup` already supports `minSelect`, `maxSelect`, and `isRequired`.
- Category-level modifier group attachment already exists via `MenuCategoryModifierGroup`.
- Current modifier price override is only item-based through `MenuItemModifierPriceOverride(menuItemId, modifierId, priceDelta)`.
- Cart/order/customer-app responses still primarily resolve selectable modifier groups from item-level links.

## Requested Behavior

### MVP-REQ-001 Category-driven variation ownership
A category must remain the owner of its variations. Any item inside that category must resolve its selectable variations from the category.

### MVP-REQ-002 Variation descriptions
Variations must support an optional description so restaurant admins can explain sizes or options like Small, Medium, Large, Regular, Family, etc.

### MVP-REQ-003 Menu scheduling
Scheduling is a menu concern, not an item/variation concern. Menus must continue to support timed availability using menu-level schedule config.

### MVP-REQ-004 Category-level modifier groups
Modifier groups must be attachable to categories so all items in that category can inherit the same addon structure by default.

### MVP-REQ-005 Item-level modifier groups remain supported
Item-level modifier groups may remain supported for backward compatibility or special-case item customization, but category-level groups should be usable as the primary source for standard flows.

### MVP-REQ-006 Modifier selection rules
Modifier groups must continue to enforce `minSelect`, `maxSelect`, and `isRequired` consistently in cart and order validation.

### MVP-REQ-007 Variation-dependent modifier pricing
Modifier/addon pricing must be able to depend on the selected variation. Example:
- Small + extra cheese = 50
- Medium + extra cheese = 80
- Large + extra cheese = 120

### MVP-REQ-008 Deterministic modifier price resolution
When a modifier is selected during cart quote or order quote, the backend must resolve the effective modifier price in this order:
1. variation-specific override
2. item-specific override (legacy/backward compatibility)
3. modifier default `priceDelta`

### MVP-REQ-009 Cart/order variation awareness
Whenever a selected item uses category-owned variations and a variation is chosen, cart and order flows must carry that variation context through validation, pricing, quote generation, and persisted order items.

### MVP-REQ-010 Customer-app/admin payload parity
Admin, cart, order, and customer-app payloads should expose enough data for frontend clients to render:
- variation id, name, description, price
- modifier groups with min/max/isRequired
- effective modifier prices based on selected variation where applicable

## Backend Interpretation
- Keep category-owned variations as the source of truth.
- Keep menu scheduling on `RestaurantMenu`.
- Promote category-level modifier groups into the main read path for menu/cart/order/customer-app flows.
- Add variation-aware modifier price overrides rather than forcing all addons to share one price across all sizes.
- Preserve item-level override support as a fallback to avoid breaking current data.

## Proposed Data Model Change
Introduce a variation-aware modifier override model, for example:
- `MenuVariationModifierPriceOverride`
  - `variationId`
  - `modifierId`
  - `priceDelta`

Recommended uniqueness:
- unique `(variationId, modifierId)`

## Proposed Service/Flow Changes
1. Menu/category/item read paths should expose category-linked modifier groups alongside current item data.
2. Cart validation should resolve allowed modifier groups from category links first, with optional merge/fallback to item-level links if needed for backward compatibility.
3. Order quote/create should resolve modifier price through variation-specific overrides before legacy item-level overrides.
4. Customer-app item payloads should expose variation descriptions and effective variation-aware addon prices.
5. Existing item-level modifier price overrides should remain readable as fallback until data migration is complete.

## Compatibility Notes
- Variation description is already supported in the current backend schema and DTO/service layer.
- Menu scheduling is already implemented at menu level and should not be moved to items/variations.
- The main missing piece is variation-based addon pricing plus consistent end-to-end use of category-level modifier groups.

## Proposed Delivery Order
1. Add variation-modifier override schema + migration
2. Add admin API support for creating/updating variation-based modifier prices
3. Update menu/customer-app/cart/order read models to expose category modifier groups consistently
4. Update cart/order pricing resolution to use variation-based modifier prices with fallback order
5. Add focused tests for Small/Medium/Large addon price differences
6. Validate backward compatibility for existing item-level override data

## Success Criteria
- Admin can define variation descriptions and variation-specific addon prices.
- Customer selecting the same addon on different sizes gets different totals when configured.
- Cart quote, order quote, and final order pricing all agree.
- Existing restaurants without variation-specific overrides still work through fallback pricing.
- Menu scheduling continues working at menu level without regression.
