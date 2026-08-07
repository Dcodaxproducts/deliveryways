# POS and Storefront Follow-up Design

**Spec**: .specs/features/pos-receipt-ux-followup/spec.md
**Status**: Approved by explicit implementation request

## Architecture Overview

- Keep the current POS cart, checkout, email, and QZ integration contracts.
- Correct the selector request lifecycle in the shared AsyncSelect.
- Preserve unsaved POS form state only when the first cart is attached from the add-item modal; normal reloads still hydrate the backend cart.
- Reuse nullable orderTime to represent instant ordering and the existing houseNumber backend DTO field.
- Reuse CartService.addItem skip-response behavior through an explicit compact query option so UI add actions avoid full cart quoting.
- Use raw ESC/POS text for thermal paper and retain HTML pixel printing for sheet paper.

## Existing Code Reuse

| Component                              | Reuse                                                       |
| -------------------------------------- | ----------------------------------------------------------- |
| AsyncSelect                            | Keep UI and fix page or reset request ordering              |
| PosCart and checkout payload helpers   | Add timing mode, state-preservation guard, and house number |
| CartService.addItem skip-response path | Expose as compact add mutation                              |
| order-ticket normalization             | Generate HTML and ESC/POS text from one normalized ticket   |
| accepted-order-printing                | Reuse manual print entry point from POS and Orders list     |
| Existing email templates               | Supply neutral localized customer-name variable             |

## Error Handling

| Scenario                              | Handling                                           |
| ------------------------------------- | -------------------------------------------------- |
| Customer page or search request races | Only the current request may update options        |
| Scheduled mode without valid time     | Block checkout with existing validation toast      |
| Thermal printer unavailable or fails  | Receipt-specific error toast; order remains placed |
| Compact add fails                     | Existing cart error and fallback handling remains  |

## Decisions

| Decision          | Choice                                  | Rationale                                                                               |
| ----------------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| Thermal output    | ESC/POS for 58 or 80 mm                 | QZ documents pixel HTML as unsuitable for many Epson, Citizen, and raw receipt printers |
| Instant timing    | orderTime null                          | Clears stale schedule using the existing nullable backend contract                      |
| Cart speed        | Explicit compact response query         | Removes full quote or rebuild cost without weakening validation                         |
| State persistence | Preserve only modal-attached first cart | Avoids overwriting staff selections while retaining reload hydration                    |
