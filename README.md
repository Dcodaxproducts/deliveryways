# DeliveryWays Backend

Multi-tenant modular monolith backend (NestJS + Prisma + PostgreSQL).

## Base Path

`/api/v1`

## Implemented Core Architecture

- **Multi-tenancy** (shared DB/shared schema) with discriminator fields:
  - `tenant_id` (group scope)
  - `restaurant_id` (brand scope)
- **Soft-delete pattern** across core tables:
  - `deleted_at` timestamp
  - `is_active` boolean
- **Global query standard** (`QueryDto`):
  - `page`, `limit`, `search`, `sortBy`, `sortOrder`
- **RBAC + Security**
  - JWT auth (`uid`, `role`, `tid`, `rid`, `bid`)
  - Roles guard
  - Tenant access guard
  - Global throttling + endpoint-level throttling
- **Standard response envelope**
  - `{ success, data, message, meta? }`
- **Global exception handling** and validation
- **Swagger/OpenAPI** docs at `/docs`

## Modules Included

- `auth` (register/login/refresh/verification/password/account lifecycle)
- `tenants` (list/update/analytics)
- `restaurants` (create/list/public/update/delete)
- `branches` (create/list/public/update/delete)
- `mailer` (verification/reset email dispatch)

## API Summary

### Auth (`/auth`)
- `POST /register-tenant`
- `POST /register-customer`
- `POST /login`
- `POST /refresh`
- `POST /verify-email`
- `POST /resend-verification`
- `POST /forgot-password`
- `POST /reset-password`
- `PATCH /change-password`
- `GET /me`
- `DELETE /account`
- `POST /cancel-deletion`

### Tenants (`/tenants`)
- `GET /` (super admin)
- `PATCH /:id`
- `GET /:id/analytics`

### Restaurants (`/restaurants`)
- `POST /`
- `GET /`
- `GET /public`
- `PATCH /:id`
- `DELETE /:id`

### Branches (`/branches`)
- `POST /`
- `GET /`
- `GET /public`
- `PATCH /:id`
- `DELETE /:id`

## Tech Stack

- NestJS 11
- Prisma 7
- PostgreSQL
- Passport JWT
- class-validator / class-transformer
- Swagger
- Nodemailer

## Run Locally

```bash
npm install
cp .env.example .env
npx prisma generate
npm run build
npm run start:dev
```

## Branching Strategy

- `main`: production-ready
- `develop`: development/integration
- `feature/*`: feature branches
- `hotfix/*`: urgent fixes
