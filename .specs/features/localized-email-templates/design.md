# Localized Customer Email Templates Design

**Spec**: `.specs/features/localized-email-templates/spec.md`
**Status**: Approved

## Architecture

1. `GlobalSetting.notificationSettings.emailTemplates` stores normalized
   templates for six customer email events.
2. `TransactionalEmailService` resolves locale, validates variables through the
   global-settings contract, renders placeholders, and delegates delivery to
   the existing `MailerService`.
3. Customer locale is stored as `Profile.metadata.locale`; the existing profile
   endpoint accepts a locale-only patch.
4. Notification queries load order items and profile metadata so delayed
   status/payment emails use the same locale and detailed variables.
5. Super Admin extends the existing Notification Settings form and endpoint.

## Code Reuse

| Existing component | Reuse |
| --- | --- |
| `GlobalSetting.notificationSettings` | JSON persistence without migration |
| `GlobalSettingsService` | Defaults, normalization, validation, public config |
| `MailerService` | SMTP transport and attachments |
| Customer `Accept-Language` interceptor | Active storefront locale |
| `PATCH /auth/me/profile` | Locale preference persistence |
| Super Admin notification form/hooks | Template fetch/save UI |

## Template Events

| Key | Variables |
| --- | --- |
| `verification` | `otp`, `expiresMinutes` |
| `passwordReset` | `otp`, `expiresMinutes` |
| `orderConfirmation` | `customerName`, `orderNumber`, `branchName`, `orderType`, `items`, `subtotal`, `taxAmount`, `deliveryFee`, `discountAmount`, `totalAmount`, `currency` |
| `orderStatus` | `customerName`, `orderNumber`, `branchName`, `status` |
| `paymentStatus` | `customerName`, `orderNumber`, `branchName`, `status`, `amount`, `currency` |
| `giftCard` | `buyerName`, `buyerEmail`, `title`, `amount`, `currency`, `code`, `expiresAt`, `message` |

## Locale Resolution

`profile.metadata.locale` → `GlobalSetting.defaultLanguage` → `de`.

Only `de` and `en` are accepted. Unsupported values are normalized to the
fallback instead of becoming template keys.

## Error Handling

| Scenario | Handling |
| --- | --- |
| Unsupported placeholder | Reject settings update with 400 |
| Missing/corrupt stored template | Use built-in localized default |
| Missing customer locale | Use platform default, then German |
| Empty optional variable | Render as empty text |
| SMTP failure | Preserve existing logging/retry semantics |

## Decisions

- Plaintext subject/body templates keep the current mail transport contract and
  avoid unsafe administrator-authored HTML.
- Platform templates are stored in existing JSON, so deployment requires no
  database migration.
- Existing customers immediately receive German because German is the final and
  current platform-default fallback.

