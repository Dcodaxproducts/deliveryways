# Localization Design

## Recommended Storage
Use a dedicated `EntityTranslation` table instead of adding JSON translation columns to every catalog model.

Proposed shape:
- `id`
- `tenantId`
- `restaurantId`
- `entityType`
- `entityId`
- `locale`
- `fields` JSON
- `isActive`
- `createdBy`
- `updatedBy`
- timestamps

Key constraints:
- unique `(restaurantId, entityType, entityId, locale)`
- indexes on `(tenantId, restaurantId, locale)` and `(entityType, entityId, locale)`
- all reads/writes verify entity ownership inside the entity's owning module or through a localization repository helper

## Why This Path
- Keeps current domain tables and existing APIs stable.
- Supports many entity types without repeated migration churn.
- Lets customer-facing mappers apply translations at the edge of the response.
- Avoids changing search/sort/slug behavior in the first phase.

## Response Strategy
1. Resolve requested locale from query/header/default.
2. Fetch normal records through existing repositories.
3. Fetch translations for the returned entity ids in one batched query.
4. Overlay only allowed display fields.
5. Fall back to default fields for missing locale/field translations.

## API Strategy
Admin translation APIs:
- `GET /api/v1/localizations?restaurantId=&entityType=&entityId=&locale=`
- `PUT /api/v1/localizations/:entityType/:entityId/:locale`
- `DELETE /api/v1/localizations/:entityType/:entityId/:locale`

Customer/public support:
- Add optional `locale` query to customer app public queries.
- Optionally support `Accept-Language` in controller once query path is stable.

## Field Allowlist
Each entity type gets a strict allowlist:
- `RESTAURANT`: `name`, `tagline`, `bio`
- `BRANCH`: `name`, `description`
- `RESTAURANT_MENU`: `name`, `description`
- `MENU_CATEGORY`: `name`, `description`
- `MENU_ITEM`: `name`, `description`, `ingredients`, `nutritionalInformation`
- `MENU_ITEM_VARIATION`: `name`, `description`
- `MODIFIER_GROUP`: `name`, `description`
- `MODIFIER`: `name`
- `COUPON`: `title`, `description`

## Migration Safety
- Do not run `prisma migrate dev` until DB drift is handled or a safe local DB is confirmed.
- If a migration is needed on a shared database, take `pg_dump` first.
- Create migration SQL manually if drift prevents `migrate dev`, then verify with `prisma generate`, typecheck, build, focused tests, full tests, and lint.

## Risk Controls
- Default response path stays untouched when no locale is requested.
- Translation overlay happens after availability/pricing/promotion logic.
- Translation table is tenant/restaurant scoped.
- Tests include cross-restaurant access rejection.
