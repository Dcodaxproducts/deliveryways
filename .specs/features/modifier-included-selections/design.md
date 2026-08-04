# Included Modifier Selections Design

## Data model

Add `ModifierGroup.includedSelect Int @default(0)` mapped to `included_select`. A database check constraint and service validation enforce `0 <= includedSelect <= maxSelect`.

## Pricing algorithm

For every submitted modifier group:

1. Initialize `remainingIncluded` from the group's `includedSelect`.
2. Traverse selected modifiers in request order.
3. `includedQuantity = min(quantity, remainingIncluded)`.
4. `chargedQuantity = quantity - includedQuantity`.
5. Reduce `remainingIncluded` and price only `chargedQuantity`.

The backend remains authoritative. Frontends mirror the algorithm only for immediate UI feedback.

## Persistence and responses

Order modifier snapshots retain `quantity` and normal `unitPrice`, and add `includedQuantity` and `chargedQuantity`. Cart modifier details add the same fields and retain `total`, calculated from charged quantity.

## Validation

- DTO validation rejects negative/non-integer values.
- Service validation compares included count with the final max count on create/update.
- The database constraint protects direct writes.

## Failure behavior

- Creating or updating a group with `includedSelect > maxSelect` returns HTTP 400.
- Legacy selections without group identifiers receive no free allowance.
