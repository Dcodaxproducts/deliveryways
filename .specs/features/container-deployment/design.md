# DeliveryWay Container Deployment Design

**Spec**: `.specs/features/container-deployment/spec.md`
**Status**: Approved from the deployment decisions confirmed in conversation

## Architecture Overview

Plesk-managed Nginx terminates HTTPS and proxies localhost-only ports to five application containers. The NestJS API and PostgreSQL communicate over a private Compose network. Development, staging, and production reuse the same service definitions but run under different Compose project names, override files, secrets, ports, networks, and volumes.

The application images are defined in their owning repositories. Cross-application orchestration and operational scripts live under the backend repository's `deploy/` directory so the deployment contract is versioned with the API and can reference sibling checkouts on the server.

## Code Reuse Analysis

| Existing component | Location | Reuse |
| --- | --- | --- |
| PostgreSQL 16 service and health check | `docker-compose.yml` | Retain version, volume, and `pg_isready` concepts without development credentials or public DB ports. |
| Safe deploy ordering | `scripts/deploy-safe.sh` | Retain DB doctor/backup/migrate/build ordering; replace host npm/PM2 execution with Compose/image operations. |
| DB backup/restore scripts | `scripts/backup-db.sh`, `scripts/restore-db.sh` | Adapt for explicit Compose projects and environment-specific containers. |
| Nest production entrypoint | `package.json` | Use `node dist/src/main.js`. |
| Next production entrypoint | frontend `package.json` files | Use standalone Next output and `node server.js`. |
| Plesk server | server control plane | Retain domain, TLS, and Nginx proxy ownership. |

## Components

### Backend image

- **Purpose**: Build the NestJS API and Prisma client into a production runtime image.
- **Location**: backend `Dockerfile`, `.dockerignore`.
- **Dependencies**: Node LTS base, npm lockfile, Prisma generation, compiled `dist`.
- **Runtime**: non-root user, production environment, persistent storage mount only where required.

### Migration image target

- **Purpose**: Run the repository-pinned Prisma CLI without adding build tooling to the API runtime image.
- **Location**: backend `Dockerfile` migration target.
- **Interface**: `npx prisma migrate deploy` invoked as an explicit one-shot Compose operation.
- **Dependency**: successful backup gate for production.

### Frontend images

- **Purpose**: Build each Next.js app as a lean standalone production server.
- **Location**: each frontend repository's `Dockerfile`, `.dockerignore`, and `next.config.*` standalone output setting.
- **Dependencies**: environment-specific public variables supplied during image build.

### Compose orchestration

- **Purpose**: Define services, private networking, volumes, health checks, localhost bindings, logging, and restart behavior.
- **Location**: backend `deploy/compose.yml`, `deploy/compose.development.yml`, `deploy/compose.staging.yml`, `deploy/compose.production.yml`.
- **Interfaces**: explicit `docker compose -p deliveryway-{environment}` commands.

### Operational scripts

- **Purpose**: Validate configuration, back up/restore PostgreSQL, apply migrations, deploy immutable images, smoke test, and roll back.
- **Location**: backend `deploy/scripts/`.
- **Dependencies**: Docker Compose, root-owned environment files, writeable backup directory.

### Plesk proxy configuration

- **Purpose**: Map HTTPS domains to localhost-only application ports and preserve WebSocket upgrades.
- **Location**: documented Plesk per-domain Nginx settings; not stored as live secrets.

## Data and Isolation Model

No application data model changes are introduced. Each server environment receives its own PostgreSQL container, credentials, private network, and named volume. Migration files are promoted between environments. The only cross-server data movement is the explicitly verified legacy development dump imported once into the isolated development volume; staging and production contents remain independent.

## Error Handling Strategy

| Scenario | Handling | Impact |
| --- | --- | --- |
| Missing secret | Preflight/Compose interpolation fails before rollout. | Existing release remains running. |
| PostgreSQL unhealthy | API readiness fails; migration/deploy stops. | No traffic cutover. |
| Backup failure | Production migration/deploy aborts. | Database and current release remain unchanged. |
| Development import targets non-empty DB | Import aborts before `pg_restore`. | Existing development data remains unchanged. |
| Development import checksum mismatch | Import aborts before starting restore. | No database contents change. |
| Migration failure | Stop rollout and investigate; do not auto-revert schema. | Prior app remains selected where compatible. |
| Application health failure | Keep prior image references and roll back application services. | Brief or no outage depending on proxy timing. |
| Server loss | Restore encrypted off-server backup on replacement host. | Recovery time depends on backup freshness and DNS. |

## Technical Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Process manager | Docker restart policies, no PM2 | One process manager avoids duplicate lifecycle behavior. |
| Database | Self-managed PostgreSQL 16 container initially | Fits single-server scope and existing stack; managed DB remains an upgrade path. |
| Environment model | Concurrent isolated Compose projects | Avoids unsafe mode switching and shared data. |
| Legacy development migration | One guarded custom-format restore into a new development volume | Preserves current test data without overwriting staging or normalizing legacy secrets into Git. |
| Staging runtime | Production builds with `NODE_ENV=production` | Maximizes production parity while using staging-specific `APP_ENV`, domains, data, and keys. |
| Public exposure | Plesk/Nginx only; app ports bind localhost; DB has no host port | Minimizes attack surface. |
| Build promotion | Immutable Git-SHA images | Enables reproducibility and rollback without rebuilding. |
| Secrets | Root-owned server env files initially | Keeps secrets out of Git; can evolve to a dedicated secrets manager. |
| Database scaling | Index/query/pooling/vertical scaling before sharding | Matches current scale and avoids premature complexity. |
