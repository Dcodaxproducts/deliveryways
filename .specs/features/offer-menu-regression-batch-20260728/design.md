# Design

## Deal selection groups

The existing deal category scopes are the selection groups. Each category
scope keeps its exact `itemLimit` and gains optional included/excluded item ID
lists. A deal may simultaneously keep top-level scoped items as fixed required
items and category scopes as customer-selectable groups.

Eligibility for a category group is:

`(all active category items ∩ included items, when configured) − excluded items`

Legacy category scopes with neither list continue to include all active
category items. Existing item-only deals keep their current behavior.

Customer selections use an ordered array rather than a set of IDs. This
permits the same item to occupy multiple required slots. Repeated instances of
the same product share the selected product configuration.

## Ordering

Coupons gain a stable `sortOrder`. Reorder APIs accept the complete visible
ordered ID list within the authorized restaurant. Menu item reorder uses the
same complete-list rule and the list query explicitly requests `sortOrder`.

## Happy Hour schedule

The backend remains authoritative for active Happy Hours. Schedule evaluation
converts the current instant to the restaurant timezone, handles overnight
windows, and uses an end-exclusive boundary. The Customer homepage refreshes
active promotions every 30 seconds so an offer appears/disappears without
navigation.

## Product information

Admin selectors format configured entries as `code — label`. Customer product
information maps the same entries to labels only. Image and description
rendering are conditional.

## Migration

Forward:

1. Add nullable JSON include/exclude lists to category scopes.
2. Add coupon `sortOrder` and its list index.
3. Do not backfill existing coupons; legacy fallback preserves them.

Rollback:

1. Deploy code that ignores the new JSON lists and `sortOrder`.
2. Drop the additive columns/index only after confirming no newly configured
   deals depend on them.

The migration is additive and does not rewrite existing rows.
