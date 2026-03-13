# Auth Module — DeliveryWays

## Purpose
Handles authentication, token lifecycle, account registration, email verification, password reset, current-user profile access, and account deletion flows.

---

## Controller
- Base path: `/api/v1/auth`
- Source: `src/modules/auth/`

---

## Main responsibilities
- Register tenant/business owner
- Register customer
- Login + refresh tokens
- Development auth helpers
- Email verification via OTP
- Password reset via OTP
- Current-user profile fetch/update
- Scheduled self-delete request + cancel deletion
- Super-admin bulk force delete by email

---

## Related models
### User
Key fields used by auth:
- `id`
- `email`
- `password`
- `role`
- `isVerified`
- `verificationOtp`
- `verificationOtpExpiresAt`
- `verificationOtpAttempts`
- `resetPasswordOtp`
- `resetPasswordOtpExpiresAt`
- `resetPasswordOtpAttempts`
- `refreshTokenHash`
- `tenantId`
- `restaurantId`
- `branchId`
- `isActive`
- `deletedAt`
- `deleteAfter`

### Profile
- optional one-to-one user profile
- stores first/last name, avatar, phone, bio

### Tenant / Restaurant / Branch
Registration flow creates tenant/restaurant/main branch and links owner user.

---

## Auth token payload
Access token payload currently carries:
- `uid` → user id
- `role` → user role
- `tid` → tenant id
- `rid` → restaurant id
- `bid` → branch id

This payload is used by guards and by domain modules to infer restaurant/branch scope from logged-in users.

---

## API surface

### Public
#### `POST /auth/register-tenant`
Creates:
- tenant
- restaurant
- main branch
- business admin user
- access token + refresh token

Body groups:
- `tenant`
- `restaurant`
- `branch`
- `user`

Returns:
- owner/tenant/restaurant/branch ids
- auth tokens
- user payload
- dev `verificationOtp` when email is disabled in non-production

#### `POST /auth/register-customer`
Creates a customer linked to a restaurant + tenant.

Important body fields:
- `restaurantId`
- `email`
- `password`
- `firstName`
- `lastName`
- `phone?`

#### `POST /auth/login`
Body:
- `email`
- `password`

Returns:
- `accessToken`
- `refreshToken`
- user context

#### `POST /auth/refresh`
Body:
- `refreshToken`

Returns new access/refresh token pair.

#### `POST /auth/dev-token`
Dev helper to mint an access token from supplied payload.
Disabled in production.

#### `POST /auth/dev-bootstrap-super-admin`
Dev helper to create or refresh a super admin account.
Disabled in production.

#### `POST /auth/forgot-password`
Issues password-reset OTP.

Body:
- `email`
- `restaurantId?`

Behavior:
- if account exists → stores reset OTP and expiry
- if email provider enabled → sends mail
- if mail disabled in non-production → exposes `resetOtp` in response
- if account does not exist → still returns generic success message

#### `POST /auth/resend-otp`
Re-issues password-reset OTP using the same flow as forgot password.

Body:
- `email`
- `restaurantId?`

#### `POST /auth/reset-password`
Body:
- `email`
- `restaurantId?`
- `otp`
- `newPassword`

Rules:
- invalid/expired OTP rejected
- attempts capped
- refresh token hash cleared after reset

---

### Authenticated
#### `GET /auth/me`
Returns current user context + profile.

#### `PATCH /auth/me/avatar`
Updates current user avatar.

Body:
- `avatarUrl`

#### `PATCH /auth/change-password`
Body:
- `currentPassword`
- `newPassword`

#### `POST /auth/verify-email`
Body:
- `otp`

Rules:
- user must exist
- user must not already be verified
- OTP must exist and be unexpired
- max invalid attempts enforced

#### `POST /auth/resend-verification`
Generates a fresh email-verification OTP for the logged-in user.

#### `DELETE /auth/account`
Soft-deletes current user account.

Behavior:
- sets `deletedAt`
- sets `isActive = false`
- sets `deleteAfter = now + 30 days`

#### `POST /auth/cancel-deletion`
Cancels scheduled self-deletion.

---

### Super admin only
#### `POST /auth/admin/users/force-delete`
Bulk permanent delete by email.

Body:
```json
{
  "emails": ["a@example.com", "b@example.com"]
}
```

Behavior:
- normalizes emails
- tries each user individually
- deletes profile first, then user row
- blocks deletion when the user has protected relations

Current block reasons:
- user is super admin
- user is tenant owner
- user is branch manager
- user has inventory movement history
- user has order history
- user has coupon usage history

Response data shape:
```json
{
  "requestedCount": 2,
  "deletedCount": 1,
  "blockedCount": 1,
  "notFoundCount": 0,
  "deleted": ["a@example.com"],
  "blocked": [
    {
      "email": "b@example.com",
      "reasons": ["user has order history"]
    }
  ],
  "notFound": []
}
```

This endpoint is intended for admin cleanup and is safer than raw Prisma Studio hard deletes.

---

## Flows
### Tenant registration flow
1. Validate unique user email
2. Validate unique tenant slug
3. Create tenant
4. Create restaurant
5. Create main branch
6. Create business admin user
7. Assign tenant owner
8. Send or expose verification OTP
9. Issue access + refresh tokens

### Customer registration flow
1. Validate restaurant exists
2. Validate email uniqueness
3. Create customer user
4. Send or expose verification OTP
5. Issue access + refresh tokens

### Password reset flow
1. `forgot-password` or `resend-otp`
2. OTP stored on user with expiry
3. user submits `reset-password`
4. OTP verified
5. password updated
6. refresh token hash cleared

### Self-delete flow
1. user calls `DELETE /auth/account`
2. account becomes inactive and scheduled for deletion
3. user may call `POST /auth/cancel-deletion`

### Force delete flow
1. super admin submits email array
2. system loads matching users
3. protected relations are checked
4. safe users are hard-deleted in transaction
5. blocked users are returned with reasons

---

## Notes
- This module currently uses OTP-based verification and password reset.
- Dev mode may expose OTPs in responses when email delivery is disabled.
- Domain modules should prefer token-derived `rid/bid/tid` for logged-in scope where applicable.
- Raw Prisma Studio deletes can fail because of relational constraints; prefer app APIs for deletion workflows.
