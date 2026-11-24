# Development partner fixture

A deterministic, idempotent fixture for exercising an **existing** DeliveryWays partner restaurant. It is intentionally development/test-only and never creates or changes the partner account, password, tenant, restaurant, or branch.

## Safety contract

All actions, including read-only dry-run and verify, require:

- `NODE_ENV=development` or `test`;
- exact `DELIVERYWAYS_DEV_FIXTURE_CONFIRM=I_UNDERSTAND_THIS_MUTATES_A_DEVELOPMENT_DATABASE`;
- a PostgreSQL database name containing `dev`, `development`, `test`, `local`, or `sandbox`;
- no production-like marker (prod, production, live, staging) in the database host/name/user;
- existing tenant, restaurant, active main branch, and active partner user with `BUSINESS_ADMIN` role linked to that tenant and restaurant.

The fixture fails on unique-key collisions with non-fixture records. Cleanup deletes deterministic fixture-owned IDs only. Existing loyalty program configuration is reused and never modified or deleted. Finance wallets and payouts are not created.

## Development server Docker topology

From the deployed DeliveryWays checkout containing this command, use the development overlay and env file:

```bash
export TENANT_ID='<tenant-id>' RESTAURANT_ID='<restaurant-id>' PARTNER_EMAIL='<partner-email>'
export FIXTURE_CONFIRM='I_UNDERSTAND_THIS_MUTATES_A_DEVELOPMENT_DATABASE'

# Read-only validation and plan
docker compose --env-file /opt/deliveryway/env/.env.development \
  -f deploy/compose.yml -f deploy/compose.development.yml --profile tools run --rm --no-deps \
  -e NODE_ENV=development -e DELIVERYWAYS_DEV_FIXTURE_CONFIRM="$FIXTURE_CONFIRM" \
  --entrypoint npm migration run fixture:dev:partner -- --action=dry-run --tenant-id="$TENANT_ID" --restaurant-id="$RESTAURANT_ID" --partner-email="$PARTNER_EMAIL"

# Apply (idempotent)
docker compose --env-file /opt/deliveryway/env/.env.development \
  -f deploy/compose.yml -f deploy/compose.development.yml --profile tools run --rm --no-deps \
  -e NODE_ENV=development -e DELIVERYWAYS_DEV_FIXTURE_CONFIRM="$FIXTURE_CONFIRM" \
  --entrypoint npm migration run fixture:dev:partner -- --action=apply --tenant-id="$TENANT_ID" --restaurant-id="$RESTAURANT_ID" --partner-email="$PARTNER_EMAIL"

# Verify
docker compose --env-file /opt/deliveryway/env/.env.development \
  -f deploy/compose.yml -f deploy/compose.development.yml --profile tools run --rm --no-deps \
  -e NODE_ENV=development -e DELIVERYWAYS_DEV_FIXTURE_CONFIRM="$FIXTURE_CONFIRM" \
  --entrypoint npm migration run fixture:dev:partner -- --action=verify --tenant-id="$TENANT_ID" --restaurant-id="$RESTAURANT_ID" --partner-email="$PARTNER_EMAIL"

# Cleanup fixture-owned records only
docker compose --env-file /opt/deliveryway/env/.env.development \
  -f deploy/compose.yml -f deploy/compose.development.yml --profile tools run --rm --no-deps \
  -e NODE_ENV=development -e DELIVERYWAYS_DEV_FIXTURE_CONFIRM="$FIXTURE_CONFIRM" \
  --entrypoint npm migration run fixture:dev:partner -- --action=cleanup --tenant-id="$TENANT_ID" --restaurant-id="$RESTAURANT_ID" --partner-email="$PARTNER_EMAIL"
```

Dry-run connects read-only to validate the target relationships; it does not mutate data. Apply and cleanup run their changes in transactions.

## Dataset

One menu; three categories; six items; two variations; one modifier category/group and four modifiers; four customers; eight orders spanning statuses, order types, payment methods, and dates; six payment transaction records; four reservations; two coupons (promotion and scoped meal deal); four loyalty accounts and transactions. Package plans/subscriptions are tenant-level billing configuration and are deliberately unsupported by this restaurant fixture.
