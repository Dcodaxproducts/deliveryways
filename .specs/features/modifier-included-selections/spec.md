# Included Modifier Selections Specification

## Summary

Allow a restaurant admin to configure a modifier group with a number of selections included in the menu item's base price. The same modifier remains defined once; selected units within the allowance are free and additional units use the modifier's configured price.

## Requirements

### MODINC-001 Group configuration

A modifier group exposes `includedSelect`, an integer from zero through the group's effective `maxSelect`. New and existing groups default to zero.

### MODINC-002 API exposure

Restaurant Admin, customer menu, and cart payloads expose `includedSelect` with each modifier group.

### MODINC-003 Pricing

For grouped selections, the first `includedSelect` selected units are included and remaining units are charged at their resolved modifier price. Allocation follows the submitted group selection order.

### MODINC-004 Consistent totals

Cart quotes, order quotes, checkout, POS, deals, and split-item calculations must use the charged quantity. Snapshots expose total, included, and charged quantities without breaking existing consumers.

### MODINC-005 Admin experience

The modifier-group create/edit form lets the admin set the included count and prevents it from exceeding the maximum selection count.

### MODINC-006 Customer and POS experience

Customer customization and POS show the included allowance and calculate displayed totals using the same first-included-then-paid rule.

## Compatibility

- Existing data receives `includedSelect = 0`, preserving current prices.
- Ungrouped legacy modifier payloads remain fully charged because they do not identify an allowance-bearing group.
- No duplicate modifier record is required.

## Out of scope

- Per-item or per-category overrides of the included count.
- Different allowance counts per modifier inside one group.
- Choosing the free units by price rather than selection order.
