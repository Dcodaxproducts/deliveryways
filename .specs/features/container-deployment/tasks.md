# DeliveryWay Container Deployment Tasks

**Design**: `.specs/features/container-deployment/design.md`
**Status**: In Progress

## Execution Plan

### Phase 1: Image foundation

`T1 → T2 → T3 → T4 → T5`

### Phase 2: Orchestration

`T1..T5 → T6 → T7 → T8`

### Phase 3: Operations and verification

`T8 → T9 → T10 → T11 → T12`

### Phase 4: Server rollout

`T12 → T13 → T14 → T15`

## Task Breakdown

### T1: Add backend Docker build context

**Status**: Done

**What**: Add a multi-stage backend image and build-context exclusions.
**Where**: `Dockerfile`, `.dockerignore`
**Depends on**: None
**Requirement**: DEP-01, DEP-03
**Tools**: `apply_patch`, Docker, npm; skills `coding-guidelines`, `tlc-spec-driven`

**Done when**:

- [x] Production and migration targets build from the lockfile.
- [x] API runs with `node dist/src/main.js` as a non-root user.
- [x] Secrets, Git metadata, backups, storage, tests, and local dependencies are excluded.

**Verify**: `docker build --target production -t deliveryways-api:test .` and inspect image user/entrypoint.

**Commit**: `build(deploy): add backend container image`

### T2: Add backend container liveness endpoint

**Status**: Done

**What**: Add a minimal unauthenticated liveness route that does not expose system details.
**Where**: backend application controller/test files
**Depends on**: T1
**Requirement**: DEP-07
**Tools**: `apply_patch`, Jest, Docker; skill `nestjs-best-practices`

**Done when**:

- [x] `GET /api/v1/health/live` returns a stable success response without authentication.
- [x] Focused tests and Nest verification pass.

**Verify**: focused Jest plus container HTTP probe.

**Commit**: `feat(health): add container liveness endpoint`

### T3: Add restaurant-admin image

**Status**: Done

**What**: Enable standalone Next output and add its production image files.
**Where**: restaurant-admin `next.config.mjs`, `Dockerfile`, `.dockerignore`
**Depends on**: T1
**Requirement**: DEP-02, DEP-03
**Tools**: `apply_patch`, Docker, npm

**Done when**: standalone build and container HTTP probe pass. Verified with 64 test files / 414 tests and container `/login` HTTP 200.

**Commit**: `build(deploy): add restaurant admin container image`

### T4: Add superadmin image

**Status**: Done

**What**: Enable standalone Next output and add its production image files.
**Where**: superadmin `next.config.mjs`, `Dockerfile`, `.dockerignore`
**Depends on**: T1
**Requirement**: DEP-02, DEP-03
**Tools**: `apply_patch`, Docker, npm

**Done when**: standalone build and container HTTP probe pass. Verified with lint, explicit TypeScript check, production build, and container `/auth/login` HTTP 200.

**Commit**: `build(deploy): add superadmin container image`

### T5: Add customer and landing images

**Status**: Done

**What**: Add independently verified standalone image files to the customer website and landing page repositories.
**Where**: each repository's `next.config.*`, `Dockerfile`, `.dockerignore`
**Depends on**: T1
**Requirement**: DEP-02, DEP-03
**Tools**: `apply_patch`, Docker, npm

**Done when**: each image builds and responds to an HTTP probe; commits remain repository-specific. Customer verified with 63 test files / 441 tests and `/auth/login` HTTP 200; landing verified with lint/typecheck/i18n/build and `/` HTTP 200.

**Commits**: `build(deploy): add customer website container image`; `build(deploy): add landing page container image`

### T6: Add common Compose definition

**Status**: Done

**What**: Define the API, four web apps, PostgreSQL, private network, health checks, volumes, logs, and restart behavior.
**Where**: `deploy/compose.yml`
**Depends on**: T1-T5
**Requirement**: DEP-04, DEP-05, DEP-07, DEP-11
**Tools**: `apply_patch`, Docker Compose

**Done when**: `docker compose config` renders with no public PostgreSQL port and dependency health gates.

**Verification**:

- [x] Compose renders all six runtime services without starting containers.
- [x] PostgreSQL has no host port and joins only an internal database network.
- [x] API waits for PostgreSQL health; web applications wait for API health.
- [x] Named data volumes, restart policies, stop grace periods, and log rotation render correctly.

**Commit**: `build(deploy): define deliveryway compose stack`

### T7: Add environment overrides and templates

**Status**: Done; placeholder rejection is enforced by T8

**What**: Add staging/production override files and non-secret environment templates.
**Where**: `deploy/compose.staging.yml`, `deploy/compose.production.yml`, `deploy/env/*.example`
**Depends on**: T6
**Requirement**: DEP-04, DEP-06
**Tools**: `apply_patch`, Docker Compose

**Done when**: both rendered configurations have distinct localhost ports and no placeholder production secrets accepted by preflight.

**Verification**:

- [x] Staging renders as project `deliveryway-staging` on localhost ports 6050-6054.
- [x] Production renders as project `deliveryway-prod` on localhost ports 5050-5054.
- [x] Both environments keep PostgreSQL un-published on an internal-only network.
- [x] Only placeholder templates are versioned; completed environment files remain ignored.
- [x] T8 preflight rejects every `REPLACE_WITH` placeholder before mutation.

**Commit**: `build(deploy): isolate staging and production stacks`

### T8: Add deployment preflight

**Status**: Done

**What**: Validate host identity, required variables, Compose rendering, image tags, directories, and Docker health before mutation.
**Where**: `deploy/scripts/preflight.sh`
**Depends on**: T7
**Requirement**: DEP-06, DEP-10
**Tools**: `apply_patch`, ShellCheck if available, Docker Compose

**Done when**: valid config passes and missing/placeholder variables fail without starting services.

**Verification**:

- [x] Bash syntax validation passes.
- [x] A complete staging fixture passes every check and Compose rendering.
- [x] The example template fails on placeholder detection with a non-zero exit.
- [x] No containers, networks, or volumes exist after preflight execution.

**Commit**: `build(deploy): add deployment preflight checks`

### T9: Add database lifecycle scripts

**What**: Add environment-scoped PostgreSQL backup, migration, and disposable restore verification.
**Where**: `deploy/scripts/backup-db.sh`, `migrate-db.sh`, `verify-restore.sh`
**Depends on**: T8
**Requirement**: DEP-05, DEP-08
**Tools**: `apply_patch`, PostgreSQL container tools, Docker Compose

**Done when**: staging backup, migration, and restore verification pass; scripts refuse ambiguous environment input.

**Commit**: `build(deploy): add database release safeguards`

### T10: Add release and rollback scripts

**What**: Deploy immutable image sets, run smoke checks, record releases, and roll back application images.
**Where**: `deploy/scripts/deploy.sh`, `smoke-test.sh`, `rollback.sh`
**Depends on**: T9
**Requirement**: DEP-07, DEP-10
**Tools**: `apply_patch`, curl, Docker Compose

**Done when**: staging can deploy two versions and return to the prior version without changing its DB volume.

**Commit**: `build(deploy): add release and rollback workflow`

### T11: Add Plesk and operations runbook

**What**: Document domains, TLS, reverse proxy/WebSocket config, logs, monitoring, backups, and incident checks.
**Where**: `deploy/README.md`
**Depends on**: T10
**Requirement**: DEP-09, DEP-11
**Tools**: Plesk CLI/UI reference, Docker commands

**Done when**: a second operator can configure staging from the runbook without undocumented commands.

**Commit**: `docs(deploy): add plesk deployment runbook`

### T12: Add CI image pipeline

**What**: Replace the failed host Node/PM2 workflow with verified image build/publish and approval-gated promotion.
**Where**: repository workflow files
**Depends on**: T10
**Requirement**: DEP-10, DEP-12
**Tools**: GitHub Actions, GitHub Container Registry

**Done when**: pull-request checks build images; staging publish/deploy is branch-gated; production requires explicit approval.

**Commit**: `ci(deploy): publish and promote container images`

### T13: Deploy isolated staging stack

**What**: Install server secrets, pull immutable images, create staging DB/volume, migrate, and start services.
**Where**: `/opt/deliveryway` on the Plesk server
**Depends on**: T12
**Requirement**: DEP-04-DEP-08

**Done when**: all staging containers are healthy and PostgreSQL has no public listener.

### T14: Configure Plesk staging domains

**What**: Configure HTTPS reverse proxies and WebSocket upgrades to localhost-only staging ports.
**Depends on**: T13
**Requirement**: DEP-09

**Done when**: every staging domain passes HTTPS and Socket.IO smoke tests.

### T15: Approve and deploy production

**What**: Back up/reconcile the production DB, deploy the exact verified images, run smoke tests, and record rollback references.
**Depends on**: T14 and explicit production approval
**Requirement**: DEP-04-DEP-12

**Done when**: production health and business-flow smoke tests pass; backup and rollback artifacts are verified.

## Task Granularity Check

Each task has one deployable concern. T5 contains two repositories but requires separate verification and commits. Server rollout tasks remain blocked behind verified images and explicit production approval.
