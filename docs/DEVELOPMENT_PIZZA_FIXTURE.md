# Compact development Pizza/Burger fixture

This versioned fixture is **development/test only**. It creates one isolated
tenant, restaurant, branch, address, and menu containing exactly two tagged
categories (`Pizza`, `Burger`) and four tagged items. `Pizza Schinken` has
small/large variations, an optional two-choice extras group, and split-pizza
metadata. All images are deterministic development placeholders.

The fixture refuses to run unless:

- `NODE_ENV` is exactly `development` or `test`;
- `DELIVERYWAYS_DEV_FIXTURE_CONFIRM` has the exact value below; and
- `DATABASE_URL` is PostgreSQL and has no `prod`, `production`, `live`, or
  `primary` marker in its URL, hostname, username, database name, or query.

It never resets a database. Apply is idempotent. Cleanup deletes only IDs with
the versioned `devfx_dw_pizza_v1_` prefix, in dependency-safe order.

## Commands

Set `DATABASE_URL` to the intended Development database through the normal
secret/config mechanism; do not paste credentials into source control.

```bash
export NODE_ENV=development
export DELIVERYWAYS_DEV_FIXTURE_CONFIRM=I_UNDERSTAND_THIS_MUTATES_A_DEVELOPMENT_DATABASE

# Safe plan only; does not connect or mutate.
npm run fixture:dev:pizza -- --action=dry-run

# Apply to Development (idempotent).
npm run fixture:dev:pizza -- --action=apply

# Verify exact counts and customization/storefront relationships.
npm run fixture:dev:pizza -- --action=verify

# Remove only this versioned fixture.
npm run fixture:dev:pizza -- --action=cleanup
```

Expected default Development host: `dev-pizza-fixture.localhost`

Expected default Development URL: `http://dev-pizza-fixture.localhost:3000`

If `CUSTOMER_APP_BASE_DOMAIN` is set, the host becomes
`dev-pizza-fixture.<CUSTOMER_APP_BASE_DOMAIN>` and HTTPS is expected for
non-local domains. The backend domain resolver can be checked with:

```text
GET /api/v1/customer-app/domain-context?host=dev-pizza-fixture.localhost
```

## Disposable database integration test

`TEST_DATABASE_URL` must point to a disposable test database. The test refuses
production markers, applies twice, validates public storefront/item/cart-read
relationships, verifies cleanup scoping, and removes test data.

```bash
NODE_ENV=test \
DELIVERYWAYS_DEV_FIXTURE_CONFIRM=I_UNDERSTAND_THIS_MUTATES_A_DEVELOPMENT_DATABASE \
TEST_DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:55432/deliveryways_fixture_test \
npm run test:fixture:integration
```
