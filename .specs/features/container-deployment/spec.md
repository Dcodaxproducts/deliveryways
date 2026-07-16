# DeliveryWay Container Deployment Specification

## Problem Statement

DeliveryWay currently has a PostgreSQL-only local Compose file and a host Node/PM2 deployment script. The complete platform needs a repeatable Docker deployment that keeps staging and production isolated, preserves PostgreSQL data, protects secrets, and supports verified rollback on the Plesk server.

## Goals

- [ ] Build reproducible production images for the NestJS backend and four Next.js applications.
- [ ] Run staging and production as independent Compose projects with separate networks, secrets, databases, and volumes.
- [ ] Provide verified database backup, migration, health-check, deployment, and rollback procedures.
- [ ] Keep Plesk/Nginx responsible for public domains, TLS, and reverse proxying.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Kubernetes | A single-server Compose deployment does not justify the operational complexity. |
| PostgreSQL sharding or high availability | Current scale does not justify distributed database topology. |
| Production database migration during image implementation | Requires a separate backup and drift-safe approval gate. |
| Public DNS or live traffic cutover during local verification | Performed only after the staging stack passes smoke tests. |

## User Stories

### P1: Reproducible application containers

**User Story**: As an operator, I want versioned application images so that the same verified artifacts run consistently across environments.

**Acceptance Criteria**:

1. WHEN an application image is built THEN Docker SHALL produce a runnable production image without requiring Node or PM2 on the host.
2. WHEN a container starts THEN it SHALL run the repository's production build command as a non-root runtime user where supported.
3. WHEN source-only or secret files exist THEN the Docker build context SHALL exclude them.

**Independent Test**: Build each image and start it with a controlled test environment.

### P1: Isolated staging and production stacks

**User Story**: As an operator, I want staging and production to coexist independently so that testing cannot mutate production services or data.

**Acceptance Criteria**:

1. WHEN staging is deployed THEN Compose SHALL create staging-specific containers, network, credentials, and PostgreSQL volume.
2. WHEN production is deployed THEN Compose SHALL create production-specific containers, network, credentials, and PostgreSQL volume.
3. WHEN either environment is changed THEN the other environment SHALL remain running and unchanged.
4. WHEN PostgreSQL is running THEN it SHALL not publish a public host port.

**Independent Test**: Render both Compose configurations and confirm distinct project namespaces, ports, networks, and volumes.

### P1: Safe database lifecycle

**User Story**: As an operator, I want explicit backup and migration gates so that schema deployments do not silently risk production data.

**Acceptance Criteria**:

1. WHEN a production migration is requested THEN the deployment SHALL require a successful database backup first.
2. WHEN schema changes are applied outside local development THEN the system SHALL use `prisma migrate deploy`.
3. WHEN a backup is created THEN it SHALL be written outside the PostgreSQL data volume and support a documented restore test.

**Independent Test**: Create a staging backup, restore it into a disposable database, and compare expected schema/data.

### P1: Controlled public exposure

**User Story**: As an operator, I want only Plesk/Nginx exposed publicly so that application and database ports remain protected.

**Acceptance Criteria**:

1. WHEN application services start THEN their host ports SHALL bind only to `127.0.0.1`.
2. WHEN the API is healthy THEN Compose and Plesk SHALL be able to verify it through an unauthenticated liveness endpoint.
3. WHEN Socket.IO is used THEN the Plesk proxy configuration SHALL preserve WebSocket upgrades.

**Independent Test**: Inspect listening sockets and access each service through its Plesk HTTPS domain.

### P2: Repeatable release and rollback

**User Story**: As an operator, I want versioned releases and scripted rollback so that a failed deployment can return to the last verified image.

**Acceptance Criteria**:

1. WHEN a release is deployed THEN each application image SHALL use an immutable version tied to a Git commit.
2. WHEN smoke tests fail THEN the operator SHALL be able to restore the previous image set without rebuilding.
3. WHEN container logs grow THEN configured rotation SHALL prevent unbounded disk usage.

**Independent Test**: Deploy two staging image versions, switch back to the first, and verify service health.

### P2: CI/CD promotion

**User Story**: As a developer, I want verified images promoted through staging before production so that production does not compile untested source.

**Acceptance Criteria**:

1. WHEN CI receives an approved development change THEN it SHALL run repository checks before publishing images.
2. WHEN a production release is approved THEN it SHALL deploy the already-verified immutable images behind a manual approval gate.

**Independent Test**: Execute a non-production workflow and verify check, build, publish, and staging deployment gates.

## Edge Cases

- WHEN PostgreSQL is unhealthy THEN the API SHALL not be considered ready.
- WHEN required secrets are absent THEN Compose validation or application startup SHALL fail clearly.
- WHEN a migration fails THEN application rollout SHALL stop and production traffic SHALL remain on the prior release.
- WHEN the server reboots THEN enabled containers SHALL restart while persistent volumes retain data.
- WHEN staging consumes excessive resources THEN production SHALL retain defined resource headroom.

## Requirement Traceability

| Requirement ID | Requirement | Status |
| --- | --- | --- |
| DEP-01 | Backend production image | Verified |
| DEP-02 | Four Next.js production images | Verified |
| DEP-03 | Build-context exclusions and secret safety | Verified |
| DEP-04 | Isolated staging and production Compose projects | Verified |
| DEP-05 | Private PostgreSQL 16 services and persistent volumes | Verified |
| DEP-06 | Environment-specific configuration and secrets | Verified |
| DEP-07 | Liveness/readiness health checks | Verified |
| DEP-08 | Backup, migration, and restore gates | In Tasks |
| DEP-09 | Plesk TLS, reverse proxy, and WebSocket routing | In Tasks |
| DEP-10 | Versioned release and rollback | Implementing |
| DEP-11 | Logging, monitoring, and resource safeguards | Implementing |
| DEP-12 | CI/CD staging promotion and production approval | In Tasks |

**Coverage**: 12 total, 12 mapped to tasks, 0 unmapped.

## Success Criteria

- [ ] Both Compose configurations pass `docker compose config` without exposing PostgreSQL.
- [ ] Every image builds reproducibly and starts with a health signal.
- [ ] Staging database backup and disposable restore are proven before production preparation.
- [ ] A staging release and rollback complete without affecting the production namespace.
- [ ] Production cutover is performed only after staging smoke tests and explicit approval.
