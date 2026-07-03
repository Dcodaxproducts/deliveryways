INSERT INTO "entity_translations" (
  "id",
  "tenant_id",
  "restaurant_id",
  "entity_type",
  "entity_id",
  "locale",
  "fields",
  "is_active",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at"
)
SELECT
  'translation_' || md5(et."id" || ':' || c."id"),
  et."tenant_id",
  et."restaurant_id",
  'CUISINE'::"LocalizationEntityType",
  c."id",
  et."locale",
  et."fields",
  et."is_active",
  et."created_by",
  et."updated_by",
  et."created_at",
  et."updated_at"
FROM "entity_translations" et
JOIN "menu_categories" mc ON mc."id" = et."entity_id" AND mc."restaurant_id" = et."restaurant_id"
JOIN "cuisines" c ON c."restaurant_id" = mc."restaurant_id" AND c."slug" = mc."slug"
WHERE et."entity_type" = 'MENU_CATEGORY'::"LocalizationEntityType"
ON CONFLICT ("restaurant_id", "entity_type", "entity_id", "locale") DO NOTHING;
