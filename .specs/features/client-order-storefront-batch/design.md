# Design

- Printing remains browser/QZ based. Realtime printing is triggered only by a transition to `CONFIRMED`; manual printing uses the same normalized ticket but bypasses automatic enablement flags.
- The existing printing JSON remains backward compatible. `autoPrintOnStatusChange` becomes the persisted confirmed-order auto-print flag; the obsolete new-order automatic path is no longer invoked.
- Address capture reuses the existing stored delivery-location object and checkout prefill utility, adding required completeness validation before the location is accepted.
- Category/item ordering uses existing reorder endpoints. List queries explicitly request `sortOrder ASC` so persisted order is visible.
- Restaurant payment methods use the existing Super Admin-only payments endpoint; the UI edits only active platform methods.
- App-promotion visibility is stored in the existing restaurant branding JSON with default `true`.
