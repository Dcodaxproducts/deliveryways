# Pizza Split / Half-and-Half Ordering

## Status
Drafted from product clarification on 2026-04-23. User confirmed this should be a real pizza-slice feature, not a simple modifier label.

## Problem
Current cart/order payloads only support:
- one `variationId` per item
- flat `modifiers[]` per item
- no section-wise customization
- no pricing rule for half-and-half combinations

That means the current backend cannot correctly model:
- two flavors on one pizza
- different toppings per half
- left/right or half-1/half-2 validation
- split pricing calculation

## Requirements

### PS1 — Split mode on eligible pizza items
Certain pizza items can be ordered in split mode.

### PS2 — Two halves / sections
A split pizza item must carry two sections (`left/right` or `half1/half2`) with explicit selections.

### PS3 — Per-section flavor selection
Each section must be able to select a flavor/item reference from an allowed set.

### PS4 — Per-section modifiers
Each section must support its own modifiers/toppings.

### PS5 — Shared variation
A split pizza still chooses one shared variation/size for the whole pizza.

### PS6 — Validation
Backend must validate:
- split mode only on eligible items
- exactly two sections
- valid referenced flavors/items
- valid per-section modifiers
- no invalid cross-category selection

### PS7 — Pricing rule
Backend must calculate split pizza price using an explicit product rule.

### PS8 — Cart support
Cart add/update/get must accept and persist split payload.

### PS9 — Quote/order support
Order quote/create must price split items correctly and persist section snapshots.

### PS10 — Frontend fetch support
Menu item payload must expose enough metadata for frontend to know an item supports split pizza and how to render it.

## Recommended defaults

### Recommendation A — Use `sections` on cart/order item payloads
Add a new optional field on cart/order items:
- `sections: [{ slot, menuItemId, modifiers[] }, { slot, menuItemId, modifiers[] }]`

This is better than forcing split data into the flat modifier array.

### Recommendation B — Keep one parent item, one shared variation
The split pizza stays a single cart/order line.
Variation/size remains on the parent item.
Sections only define flavor + section toppings.

### Recommendation C — Pricing rule = highest-half base + section modifier totals
Recommended first pricing rule:
- base price = max(section flavor prices for selected variation)
- plus all section modifier totals
- plus any parent-level adjustments if product wants them

This is the cleanest first implementation and common in pizza flows.

## Open product decisions
1. Should section slot names be `LEFT/RIGHT` or `FIRST_HALF/SECOND_HALF`?
2. Can the two halves be different menu items, or only sibling flavors from the same category?
3. What is the exact pricing rule?
   - highest half base price
   - average of both halves
   - combined with discount
   - custom restaurant-configurable rule
4. Are some modifiers allowed on the whole pizza and some per half, or only per half?
5. Should split pizza be enabled per item, per category, or inferred from category type?

## Suggested implementation slices

### Slice 1 — Contract + fetch metadata
- add split metadata on menu items
- add DTO support for `sections`
- no pricing yet

### Slice 2 — Cart support
- validate split payload on add/update cart
- persist split sections in cart item JSON
- expose split payload in cart responses

### Slice 3 — Quote + order pricing
- calculate split pricing
- snapshot section data into order items
- verify cart/order parity

### Slice 4 — Admin configuration
- allow enabling split mode on eligible items/categories
- optionally constrain allowed split flavors
