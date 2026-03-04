# DeliveryWays

Modular monolith backend built with NestJS, Prisma, and PostgreSQL.

## Architecture

- **Modular Monolith** — Each module is a bounded context with clear boundaries
- **Controller → Service → Repository → Prisma** — Strict layering
- **Module communication** via public interfaces only (no cross-module internal imports)
- **Cursor-based pagination** on all list endpoints
- **Standard response envelope:** `{ success, data, meta }`

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | NestJS 11 |
| Language | TypeScript (strict) |
| ORM | Prisma 7 |
| Database | PostgreSQL |
| Validation | class-validator + class-transformer |
| API Docs | Swagger / OpenAPI |

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Start development server
npm run start:dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build the project |
| `npm run start:dev` | Start in watch mode |
| `npm run lint` | Lint & fix |
| `npm test` | Run tests |
| `npm run test:cov` | Test with coverage |
| `npx prisma studio` | Visual DB browser |

## Project Structure

```
src/
├── common/                  # Shared utilities, DTOs, filters, guards
│   ├── decorators/
│   ├── dto/
│   ├── enums/
│   ├── exceptions/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── interfaces/
│   ├── pipes/
│   └── utils/
├── config/                  # App & database configuration
├── database/                # Prisma service & module
├── modules/                 # Feature modules (bounded contexts)
│   └── <module>/
│       ├── <module>.module.ts
│       ├── <module>.controller.ts
│       ├── <module>.service.ts
│       ├── <module>.repository.ts
│       └── dto/
├── app.module.ts
└── main.ts
```

## Branching Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code |
| `develop` | Development & testing |
| `feature/*` | Feature branches (merge into `develop`) |
| `hotfix/*` | Critical fixes (merge into `main` + `develop`) |

## License

MIT
