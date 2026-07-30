# Design

## Data and API

Allergen/additive templates already use ordered arrays in tenant settings, and
the existing bulk update endpoint preserves array order. The UI will send each
type's reordered array through that contract; no schema or endpoint change is
required.

Customer category cards already know the restaurant, branch, and item ID. The
information action will hydrate the full item through the existing item-detail
request before opening the modal, ensuring it uses the same source as the full
details page.

## UI behavior

- Template options use a single `code — label` display value.
- Manual ordering is available only in an unfiltered, unsorted view so the
  persisted position is unambiguous. Drag-and-drop and keyboard move controls
  update only the selected template type.
- Zero reviews render a compact empty state without stars or invented counts.
- Missing images render a neutral food-image fallback and recover from broken
  remote URLs.
- POS customer options use a compact custom renderer and filter `isGuest`
  records before display.

## Safety

- Tenant and restaurant scope stay on existing endpoints.
- Guest checkout mechanics remain unchanged; only selectable POS records are
  filtered.
- No migration is introduced.

