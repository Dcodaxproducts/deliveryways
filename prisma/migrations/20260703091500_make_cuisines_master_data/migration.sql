-- Convert cuisines from restaurant-scoped rows to global master data managed by super admin.
-- Keep existing item links by merging duplicate cuisine slugs into one survivor.

WITH ranked AS (
  SELECT
    id,
    slug,
    first_value(id) OVER (
      PARTITION BY slug
      ORDER BY deleted_at NULLS FIRST, is_active DESC, sort_order ASC, created_at ASC, id ASC
    ) AS survivor_id
  FROM cuisines
), remap AS (
  SELECT id, survivor_id
  FROM ranked
  WHERE id <> survivor_id
)
UPDATE menu_item_cuisines mic
SET cuisine_id = remap.survivor_id,
    updated_at = CURRENT_TIMESTAMP
FROM remap
WHERE mic.cuisine_id = remap.id;

UPDATE entity_translations et
SET entity_id = remap.survivor_id,
    updated_at = CURRENT_TIMESTAMP
FROM remap
WHERE et.entity_type = 'CUISINE'::"LocalizationEntityType"
  AND et.entity_id = remap.id;

DELETE FROM entity_translations a
USING entity_translations b
WHERE a.id > b.id
  AND a.restaurant_id = b.restaurant_id
  AND a.entity_type = b.entity_type
  AND a.entity_id = b.entity_id
  AND a.locale = b.locale;

DELETE FROM menu_item_cuisines a
USING menu_item_cuisines b
WHERE a.id > b.id
  AND a.menu_item_id = b.menu_item_id
  AND a.cuisine_id = b.cuisine_id;

WITH ranked AS (
  SELECT
    id,
    slug,
    first_value(id) OVER (
      PARTITION BY slug
      ORDER BY deleted_at NULLS FIRST, is_active DESC, sort_order ASC, created_at ASC, id ASC
    ) AS survivor_id
  FROM cuisines
)
DELETE FROM cuisines c
USING ranked r
WHERE c.id = r.id
  AND r.id <> r.survivor_id;

DROP INDEX IF EXISTS cuisines_restaurant_id_slug_key;
DROP INDEX IF EXISTS cuisines_restaurant_id_is_active_sort_order_idx;
ALTER TABLE cuisines DROP CONSTRAINT IF EXISTS cuisines_restaurant_id_fkey;
ALTER TABLE cuisines DROP COLUMN IF EXISTS restaurant_id;

CREATE UNIQUE INDEX IF NOT EXISTS cuisines_slug_key ON cuisines(slug);
CREATE INDEX IF NOT EXISTS cuisines_is_active_sort_order_idx ON cuisines(is_active, sort_order);
