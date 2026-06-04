# Global Settings Module — DeliveryWays

## Purpose
Provides a single platform-level settings record for Super Admin configuration.

This module is intentionally **global**, not tenant/restaurant/branch scoped.
It currently supports:
- tax defaults
- commission defaults
- currency display defaults
- localization defaults
- basic branding defaults
- super-admin notification settings
- platform payment method definitions
- optional enforcement flags for future downstream override rules

---

## API Surface
Base path: `/api/v1/admin/global-settings`

### Get global settings
`GET /admin/global-settings`

Role:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`
- `BRANCH_ADMIN`

Behavior:
- returns the singleton global settings record
- auto-creates the record on first access with safe defaults
- includes read-only `paymentMethods` for non-super-admin users

### Get payment methods
`GET /admin/global-settings/payment-methods`

Role:
- `SUPER_ADMIN`
- `BUSINESS_ADMIN`
- `BRANCH_ADMIN`

Behavior:
- returns platform-defined payment methods only
- business and branch admins use this endpoint as read-only data for UI

### Update global settings
`PATCH /admin/global-settings`

Role:
- `SUPER_ADMIN`

Accepted fields:
- `globalTaxPercentage`
- `vatHandlingRule`
- `defaultCommissionPercentage`
- `defaultHybridFeePercentage`
- `defaultCurrency`
- `currencyDisplayFormat`
- `defaultLanguage`
- `dateFormat`
- `timezone`
- `primaryColor`
- `secondaryColor`
- `fontFamily`
- `notificationSettings`
- `paymentMethods`
- `isTaxEnforced`
- `isCommissionEnforced`
- `isCurrencyEnforced`
- `isLocalizationEnforced`

### Update payment methods
`PATCH /admin/global-settings/payment-methods`

Role:
- `SUPER_ADMIN`

Body:
```json
{
  "paymentMethods": [
    {
      "code": "COD",
      "label": "Cash on delivery",
      "isActive": true
    },
    {
      "code": "STRIPE",
      "label": "Stripe",
      "isActive": false
    }
  ]
}
```

Notes:
- `code` must be one of `COD`, `STRIPE`, `EASYPAISA`, `JAZZCASH`, `BANK_TRANSFER`, `WALLET`
- duplicate `code` values are rejected
- omitted methods keep their previous/default label and active status

---

## Data Model
Table: `global_settings`

Key design notes:
- singleton enforced with `scope_key='GLOBAL'`
- no tenant foreign key on purpose
- audit fields: `createdBy`, `updatedBy`
- percentages stored as decimals
- notification settings stored in `notification_settings` JSONB
- payment method definitions stored in `payment_methods` JSONB
- timezone validated at service layer

---

## Default Values
First creation seeds:
- tax = `0`
- commission = `0`
- hybrid fee = `0`
- currency = `PKR`
- currency display = `SYMBOL_AMOUNT`
- language = `en`
- date format = `DD_MM_YYYY`
- timezone = `Asia/Karachi`
- payment methods = `COD` and `WALLET` active by default, other supported methods inactive
- all enforcement flags = `false`

---

## Notes
This module currently stores **platform defaults**.
It does **not** yet fan out or force-apply these settings into restaurant/branch settings automatically.
The `is*Enforced` flags are persisted now so later business rules can decide whether downstream modules must honor the platform value strictly.
