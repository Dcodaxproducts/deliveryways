# Menu Phase 3 Spec

## Summary
Extend the current restaurant menu system so menus can target categories as well as explicit items, support timed availability, and support drink deposits (Pfand). Preserve current reusable menu-item behavior while adding menu-scoped flexibility.

## Current State
- `RestaurantMenu` already exists and supports direct item attachment.
- `MenuItem` already belongs to exactly one `MenuCategory`.
- Item/category listing already supports `menuId` filtering.
- Modifier groups already support `isRequired`, `minSelect`, `maxSelect`, and can attach to both items and categories.

## Requested Behavior

### MP3-REQ-001 Menu to category assignment
A menu must be able to include one or more categories directly, not only individual items.

### MP3-REQ-002 Menu item resolution
When a menu is fetched, its effective item set must be resolvable from:
- items explicitly attached to the menu
- items belonging to categories attached to the menu

### MP3-REQ-003 Menu-only item support
A restaurant admin must still be able to attach specific items directly to a menu even when category links are used.

### MP3-REQ-004 Category/item filtering
Menu item listing must support filtering by:
- menu only
- category only
- menu + category together
- explicit item search within the resolved menu scope

### MP3-REQ-005 Modifier selection rules
Modifier/addon groups must support:
- required groups with min/max selection
- optional groups with min/max selection
This is already largely supported and should remain compatible.

### MP3-REQ-006 Timed menu scheduling
A menu must support schedule-based availability, including day/time windows suitable for breakfast/lunch/dinner or promo menus.

### MP3-REQ-007 Drink deposit support
A menu item must optionally support a separate deposit amount (Pfand-style) that is stored independently from the base item price.

## Backend Interpretation
- Keep direct menu-item links.
- Add menu-category links so a menu can include whole categories.
- Add menu timing config on the menu entity.
- Add optional deposit fields on menu items.
- Reuse existing modifier-group min/max/isRequired behavior instead of redesigning addon rules.

## Proposed Delivery Order
1. Menu category links + effective menu filtering
2. Timed menu fields and API support
3. Menu item deposit fields
4. Cart/order pricing propagation for deposit where needed
5. Any missing response-shape polish for frontend consumption

## Notes
- Some requested modifier behavior is already present in the current backend through `ModifierGroup`.
- The main net-new work is menu category linkage, timing, deposit, and effective menu resolution.
