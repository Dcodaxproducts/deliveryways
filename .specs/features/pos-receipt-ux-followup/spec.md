# POS and Storefront Follow-up Specification

## Problem Statement

The live POS and storefront still have regressions in customer selection, cart-state persistence, receipt printing, item configuration, and narrow mobile controls. The fixes must preserve the existing cart, modifier, category-navigation, checkout, and notification behavior while removing unnecessary latency.

## Goals

- [ ] Make POS customer lookup reliably display API results.
- [ ] Preserve POS order settings when the first item creates or loads a cart.
- [ ] Make scheduling explicit, delivery address entry complete, and receipt printing reliable.
- [ ] Keep item actions reachable and reduce add-to-cart response time.
- [ ] Use respectful generic greetings for walk-in and guest customers.
- [ ] Prevent mobile tip controls from overflowing.

## Out of Scope

| Feature                           | Reason                                                                     |
| --------------------------------- | -------------------------------------------------------------------------- |
| Database schema changes           | Existing cart, order, and address models already support the required data |
| Printer infrastructure deployment | This change only corrects the browser and QZ receipt data path             |
| New POS notification channels     | Existing quiet POS notification policy remains unchanged                   |

## User Stories

### P1: Reliable POS workflow

1. WHEN the customer API returns records THEN the selector SHALL display them without a later empty request replacing them.
2. WHEN the first item is added THEN the POS SHALL preserve the selected pickup, delivery, or dine-in type and other form values.
3. WHEN instant timing is selected THEN scheduling fields SHALL remain hidden and the cart SHALL not retain an old scheduled time.
4. WHEN scheduled timing is selected THEN a required date and time field SHALL be shown.
5. WHEN delivery is selected THEN guest and new-customer address forms SHALL show and submit a house-number field.

### P1: Reliable receipt printing

1. WHEN a thermal receipt is printed THEN QZ SHALL receive ESC/POS receipt content rather than pixel HTML unsuitable for raw receipt printers.
2. WHEN reprint is clicked THEN only receipt-specific success or failure feedback SHALL appear.
3. WHEN viewing an order list THEN staff SHALL have a Print receipt action for each order.
4. WHEN the POS last-order action is shown THEN its label SHALL be Reprint receipt.

### P1: Fast, usable item configuration

1. WHEN an item dialog scrolls THEN its add-to-cart action SHALL stay visible at the bottom.
2. WHEN a cart item is added through POS or storefront item flows THEN the mutation SHALL request a compact response and skip rebuilding the full priced cart response.
3. WHEN required modifiers exist THEN current validation and popup behavior SHALL remain unchanged.

### P2: Polished customer communication

1. WHEN the recipient is guest or walk-in THEN confirmation, status, and payment email variables SHALL use Customer or Kunde instead of Walk-in.
2. WHEN tip controls render on a narrow screen THEN input, apply or update, and remove controls SHALL not overflow.

## Edge Cases

- A stale paginated customer request must not overwrite a newer search or reset result.
- Returning to an existing POS cart after reload must still hydrate saved backend settings.
- Clearing a scheduled POS order must clear the stored cart time.
- A4 and A5 printing must retain pixel HTML; 58 and 80 mm receipt printing uses ESC/POS.
- Missing printer settings must report receipt unavailable without checkout wording.

## Requirement Traceability

| Requirement ID | Story                                | Status   |
| -------------- | ------------------------------------ | -------- |
| POSUX-01       | Reliable customer lookup             | In Tasks |
| POSUX-02       | Preserve POS form state              | In Tasks |
| POSUX-03       | Explicit instant or scheduled timing | In Tasks |
| POSUX-04       | House number in POS delivery         | In Tasks |
| PRINT-01       | Nonblank thermal receipt             | In Tasks |
| PRINT-02       | Receipt-only reprint feedback        | In Tasks |
| PRINT-03       | Order-list receipt action            | In Tasks |
| CART-01        | Sticky compact item dialogs          | In Tasks |
| CART-02        | Compact add-to-cart response         | In Tasks |
| EMAIL-01       | Generic guest or walk-in greeting    | In Tasks |
| MOBILE-01      | Tip controls fit narrow screens      | In Tasks |

## Success Criteria

- [ ] Targeted regression tests cover every requirement.
- [ ] Full backend, restaurant-admin, and customer verification passes.
- [ ] No database migration is introduced.
