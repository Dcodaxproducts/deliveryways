# Release baseline and promotion policy

Snapshot time: 2026-09-08 UTC

## Production baseline

Release manifest: `/opt/feastflow/releases/production/20260908T073229Z.env`

Current link: `/opt/feastflow/releases/production/current.env`

Previous application release: `/opt/feastflow/releases/production/20260908T064326Z.env`

| Component | Immutable tag | Full source commit | Runtime image ID | `origin/main` relationship |
|---|---|---|---|---|
| API | `feastflow-api:383b502e8e9b` | `383b502e8e9bff1e757fa05f64e83fb0fa67cc8f` | `sha256:206a8fefc958d04c43096bc823af62f18ccddb15e55122fec973fddddf9a3e4a` | Production contains main; 11 commits ahead |
| Migration | `feastflow-migration:383b502e8e9b` | API release commit; see note below | `sha256:9d9f55738369425b6ef813e2b2003bf0809e8ae03a28fa4e98ce0964dace0482` | No schema delta in dashboard hotfix |
| Partner | `feastflow-restaurant-admin:33f24d172b20` | `33f24d172b2090dd983c52d488b6078d3b80168a` | `sha256:56d693c30040a940170627c6e4602e8ada8e79df8b7ac6fcfdc7944fc0b634c4` | Production contains main; 5 commits ahead |
| Superadmin | `feastflow-superadmin:47e22c34980d` | `47e22c34980d95cd8452334f3cc2f24c900b6ff6` | `sha256:623ac00dd7279403c51cdc56db26d701a53a4d6af2efd16e4814e0ffa6137c70` | Production contains main; 4 commits ahead |
| Storefront | `feastflow-customer:50bbe9c8b449` | `50bbe9c8b44919ad2b622f307a6d9b3f7cc39674` | `sha256:cf7ce5f1fbf451642aefb3d5795bed5edad97b09eac42917bd27a0becab1dd18` | Production contains main; 2 commits ahead |

All five `feastflow-prod` containers were healthy with zero restarts when captured.

### Migration image note

The tag `feastflow-migration:383b502e8e9b` has a different Docker config ID and older creation timestamp than the API hotfix image. Its root filesystem layers are byte-for-byte identical to `feastflow-migration:6658f6eea39a`, the migration image from the preceding release. This is expected because the dashboard hotfix changed no Prisma schema or migration. The release had 115 migrations applied and no pending migration. Do not interpret the tag alone as proof that migration contents changed.

## Staging baseline

Release manifest: `/opt/feastflow/releases/staging/20260907T072838Z.env`

| Component | Staging commit/tag | Relationship to Production |
|---|---|---|
| API | `245cfe94e70d` | Different history, but its Stripe webhook patch is patch-equivalent in Production |
| Migration | `8041cb2` | Older migration payload |
| Partner | `8428212` | Ancestor of Production |
| Superadmin | `40a5a51` | Ancestor of Production |
| Storefront | `a4e2a83` | Ancestor of Production |

The API Staging pointer cannot fast-forward directly to the current Production commit because the histories diverged, even though the Staging patch is already patch-equivalent in Production. Before the next API Staging promotion, create and verify one topology-only normalization merge whose tree is exactly the cumulative candidate tree and whose parents connect both deployed histories. That merge must introduce no content delta. After this one-time normalization, all release-pointer movement is fast-forward only.

## Rollback inventory

- Application rollback entry point: `deploy/scripts/rollback.sh`.
- Production rollback requires `PRODUCTION_ROLLBACK_APPROVED=yes`, a target manifest, image availability, service recreation, and passing smoke tests.
- The rollback script does **not** roll back database state.
- Verified pre-hotfix database backup: `/opt/feastflow/backups/production/feastflow_prod_20260908T073211Z.dump`.
- Additional verified launch backups: `feastflow_prod_20260908T064306Z.dump` and `feastflow_prod_20260908T064430Z.dump`.
- Pre-test-tenant backup: `feastflow_prod_20260908T080217Z.dump`.
- Pre-test-rename backup: `feastflow_prod_20260908T081148Z_pretestrename.dump`.
- Production env rollback: `/opt/feastflow/backups/env-history/.env.production.before-dashboard-fix-20260908T073031Z`.
- Nginx launch rollback: `/opt/feastflow/backups/production/nginx-launch-20260908T064703Z/`.
- Root-domain restoration rollback: `/opt/feastflow/backups/production/root-domain-restore-20260908T0755Z/`.

Example only; do not execute without explicit Production rollback approval:

```bash
PRODUCTION_ROLLBACK_APPROVED=yes \
  ./deploy/scripts/rollback.sh \
  production \
  /opt/feastflow/env/.env.production \
  /opt/feastflow/releases/production/20260908T064326Z.env
```

## Permanent Git references

Each application repository uses the same reference contract:

- `main`: protected integration line for verified development changes.
- `release/staging`: exact Staging commit; never rebased or force-pushed.
- `release/production`: exact Production commit; never rebased or force-pushed.
- `production-20260908T073229Z`: immutable annotated tag on the captured Production commit.

Release branches are environment pointers, not feature-development branches. Except for the documented one-time API Staging topology normalization, a promotion must be a fast-forward to the exact commit already verified in the previous environment. If the deployed commit is not an ancestor of the candidate, build a cumulative commit on the deployed history and rerun the full verification surface.

## Promotion rules

1. Develop from the current cumulative integration line using a focused branch.
2. Pass repository typecheck, lint, tests, Production build, and affected contract/acceptance checks.
3. Fast-forward `release/staging` to the verified commit and deploy that exact immutable image. The first API promotion must use the documented no-content normalization merge.
4. Complete Staging acceptance without rebuilding source under a different commit.
5. With explicit approval, prove current Production ancestry, fast-forward `release/production`, and deploy the same verified commit/image.
6. Record the release manifest, health, smoke results, migration status, and rollback assets.
7. Never deploy an unreviewed branch directly, force-update a release ref, or let a release silently omit a live commit.

## Domain boundary

| Host | Owner |
|---|---|
| `feastflow.co`, `www.feastflow.co` | Existing Plesk/WordPress site; outside platform deployment scope |
| `api.feastflow.co` | FeastFlow API |
| `partner.feastflow.co` | FeastFlow Partner application |
| `superadmin.feastflow.co` | FeastFlow Superadmin application |
| `<restaurant-slug>.feastflow.co` | FeastFlow storefront application |
| `demo.feastflow.co`, `flutterweb.feastflow.co` | Preserved legacy hosts; do not repurpose |

`test.feastflow.co` is a controlled Production smoke tenant. It is not an automated destructive-test environment.
