# Menu metadata and POS cleanup

## Scope

This regression batch aligns allergen/additive management and customer-facing
metadata with the persisted menu data, removes fabricated review content,
improves missing-image states, and simplifies POS customer selection.

## Requirements

### META-01 — Template selection labels

Allergen and additive options in the menu item editor must display both the
template code and label. Existing selections must remain readable and
searchable by either value.

### META-02 — Category item information

Opening product information from a category card must show the same product
labels, allergens, and additives as the full item-details page.

### META-03 — Persisted template ordering

Restaurant administrators must be able to manually reorder allergen and
additive templates. Ordering is independent within each template type and must
persist through the existing bulk template update contract.

### REVIEW-01 — Real review content only

Product pages must never display fabricated reviews, ratings, or counts. Items
without reviews must show an explicit empty state.

### IMAGE-01 — Clean missing-image states

Customer search results and restaurant-admin menu item lists must render a
purposeful neutral fallback when an image is absent or fails to load.

### POS-01 — Registered-customer selector

The POS customer selector must exclude guest customer records. Each option must
show only the customer's photo, name, and email; internal IDs, guest markers,
and phone numbers are not shown.

## Out of scope

- Removing guest checkout support from existing orders or checkout payloads.
- Database schema changes or migrations.
- Reordering menu items, categories, or unrelated template types.

