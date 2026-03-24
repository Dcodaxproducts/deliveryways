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
- `POST /dev-token` (development only)
- `POST /dev-bootstrap-super-admin` (development only)
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
npm run setup:local
```

## Shared Dev/Server Sync Flow

After pulling latest code on server:

```bash
npm run db:doctor
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build
pm2 restart deliveryways-server --update-env
```

If DB auth/schema looks broken, run one-time repair:

```bash
npm run db:repair
npm run db:doctor
```

One-command safe deploy (pull + backup + migrate + build + pm2 restart):

```bash
npm run deploy:safe
```

## Seed Strategy

- `seed:base` → safe baseline data (super admin)
- `seed:demo` → recreatable demo/testing data
- `seed:all` → runs both

```bash
npm run seed:base
npm run seed:demo
npm run seed:all
```

## Backups & Restore

Create backup:

```bash
npm run db:backup
```

Restore from backup (destructive):

```bash
FORCE_RESTORE=yes npm run db:restore -- backups/db/<file>.sql
```

### Cron (every 6 hours)

```bash
0 */6 * * * cd /var/www/html/deliveryways/server && npm run db:backup >> /var/log/deliveryways-backup.log 2>&1
```

## CI/CD Automation (Develop)

This repo includes `.github/workflows/deploy-develop.yml`.
On each push to `develop`, GitHub Actions deploys to server via SSH and runs `npm run deploy:safe`.

Required GitHub repository secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY` (private key content)
- `DEPLOY_PORT` (optional if not 22)

### Local PostgreSQL (Docker)

The project includes `docker-compose.yml` with a local Postgres service.

```bash
# Start database
npm run db:up

# Follow logs
npm run db:logs

# Stop database
npm run db:down

# Reset database volume (destructive)
npm run db:reset
```

Default local connection:

```env
DATABASE_URL=postgresql://deliveryways:deliveryways@127.0.0.1:5434/deliveryways
```

Swagger: `http://localhost:3000/docs`
API Base: `http://localhost:3000/api/v1`

## Branching Strategy

- `main`: production-ready
- `develop`: development/integration
- `feature/*`: feature branches
- `hotfix/*`: urgent fixes
