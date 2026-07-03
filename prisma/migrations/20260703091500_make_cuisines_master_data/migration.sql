-- Convert cuisines from restaurant-scoped rows to global master data managed by super admin.
-- The previous migration backfilled menu categories into cuisines for compatibility, but
-- cuisines are separate master data. Remove those generated category-derived rows and
-- preserve only manually-created cuisine rows.

DELETE FROM entity_translations et
USING cuisines c
WHERE et.entity_type = 'CUISINE'::"LocalizationEntityType"
  AND et.entity_id = c.id
  AND c.id LIKE 'cuisine_%';

DELETE FROM menu_item_cuisines mic
USING cuisines c
WHERE mic.cuisine_id = c.id
  AND c.id LIKE 'cuisine_%';

DELETE FROM cuisines
WHERE id LIKE 'cuisine_%';

-- If any manually-created cuisine rows exist from the short restaurant-scoped window,
-- merge duplicate slugs before making slug globally unique.
CREATE TEMP TABLE cuisine_remap AS
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
SELECT id, survivor_id
FROM ranked
WHERE id <> survivor_id;

INSERT INTO menu_item_cuisines (
  id,
  menu_item_id,
  cuisine_id,
  sort_order,
  created_at,
  updated_at
)
SELECT
  'mic_' || md5(mic.id || ':' || remap.survivor_id) AS id,
  mic.menu_item_id,
  remap.survivor_id,
  mic.sort_order,
  mic.created_at,
  CURRENT_TIMESTAMP
FROM menu_item_cuisines mic
JOIN cuisine_remap remap ON remap.id = mic.cuisine_id
ON CONFLICT (menu_item_id, cuisine_id) DO NOTHING;

DELETE FROM menu_item_cuisines mic
USING cuisine_remap remap
WHERE mic.cuisine_id = remap.id;

DELETE FROM entity_translations et
USING cuisine_remap remap
WHERE et.entity_type = 'CUISINE'::"LocalizationEntityType"
  AND et.entity_id = remap.id
  AND EXISTS (
    SELECT 1
    FROM entity_translations existing
    WHERE existing.restaurant_id = et.restaurant_id
      AND existing.entity_type = et.entity_type
      AND existing.entity_id = remap.survivor_id
      AND existing.locale = et.locale
  );

UPDATE entity_translations et
SET entity_id = remap.survivor_id,
    updated_at = CURRENT_TIMESTAMP
FROM cuisine_remap remap
WHERE et.entity_type = 'CUISINE'::"LocalizationEntityType"
  AND et.entity_id = remap.id;

DELETE FROM cuisines c
USING cuisine_remap remap
WHERE c.id = remap.id;

DROP TABLE cuisine_remap;

DROP INDEX IF EXISTS cuisines_restaurant_id_slug_key;
DROP INDEX IF EXISTS cuisines_restaurant_id_is_active_sort_order_idx;
ALTER TABLE cuisines DROP CONSTRAINT IF EXISTS cuisines_restaurant_id_fkey;
ALTER TABLE cuisines DROP COLUMN IF EXISTS restaurant_id;

CREATE UNIQUE INDEX IF NOT EXISTS cuisines_slug_key ON cuisines(slug);
CREATE INDEX IF NOT EXISTS cuisines_is_active_sort_order_idx ON cuisines(is_active, sort_order);
