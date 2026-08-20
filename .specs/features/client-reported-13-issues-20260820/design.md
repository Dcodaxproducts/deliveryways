# Client-reported 13-issue batch design

**Spec:** `spec.md`

## Approach

- Extend the existing generated-invoice record/event lifecycle with cancelled/recreated states and Super Admin endpoints; do not create a parallel invoice model.
- Align automated payout cycles to stable UTC calendar boundaries so repeated hourly automation resolves the same source key.
- Calculate commission over the subscription period aggregate, using all paid orders, then apply the cap once. Allocate capped payout commission across order lines without exceeding the remaining cap.
- Reuse existing financial report `netReceived` values and reduce only the Restaurant Admin card set.
- Add WinOrder to the existing permission-module registry and route-access mapping.
- Make frontend changes at the existing picker, invoice-history, modifier dialog, report helper, checkout address, and order status presentation points.

## Repository ownership

| Repository       | Ownership                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Backend          | invoice lifecycle/cadence, commission, finance contract, notifications, WinOrder permission registry                        |
| Restaurant Admin | numeric picker ID, invoice actions, simplified finance cards, WhatsApp, status labels, modifier detach, category regression |
| Super Admin      | generated invoice cancel/recreate controls                                                                                  |
| Customer         | address autofill isolation and paid-label presentation                                                                      |

## Data changes

- `GeneratedInvoiceStatus`: add `CANCELLED`.
- `GeneratedInvoiceEventType`: add `CANCELLED`, `RECREATED`.
- Seed/upsert global `winorder-integration` permission module through a migration.

No tenant-scoped model is introduced.
