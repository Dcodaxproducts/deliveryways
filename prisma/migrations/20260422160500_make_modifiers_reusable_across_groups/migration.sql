ALTER TABLE "modifiers"
  ADD COLUMN IF NOT EXISTS "restaurant_id" TEXT;

UPDATE "modifiers" AS m
SET "restaurant_id" = mg."restaurant_id"
FROM "modifier_groups" AS mg
WHERE mg."id" = m."modifier_group_id"
  AND m."restaurant_id" IS NULL;

CREATE TABLE IF NOT EXISTS "modifier_group_modifiers" (
  "id" TEXT NOT NULL,
  "modifier_group_id" TEXT NOT NULL,
  "modifier_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "modifier_group_modifiers_pkey" PRIMARY KEY ("id")
);

INSERT INTO "modifier_group_modifiers" (
  "id",
  "modifier_group_id",
  "modifier_id",
  "sort_order",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  m."modifier_group_id",
  m."id",
  m."sort_order",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "modifiers" AS m
WHERE m."modifier_group_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "modifier_group_modifiers" AS mgm
    WHERE mgm."modifier_group_id" = m."modifier_group_id"
      AND mgm."modifier_id" = m."id"
  );

WITH ranked_modifiers AS (
  SELECT
    m."id",
    m."restaurant_id",
    m."name",
    FIRST_VALUE(m."id") OVER (
      PARTITION BY m."restaurant_id", m."name"
      ORDER BY
        CASE WHEN m."deleted_at" IS NULL THEN 0 ELSE 1 END,
        CASE WHEN m."is_active" THEN 0 ELSE 1 END,
        m."created_at",
        m."id"
    ) AS "canonical_id",
    ROW_NUMBER() OVER (
      PARTITION BY m."restaurant_id", m."name"
      ORDER BY
        CASE WHEN m."deleted_at" IS NULL THEN 0 ELSE 1 END,
        CASE WHEN m."is_active" THEN 0 ELSE 1 END,
        m."created_at",
        m."id"
    ) AS "row_num"
  FROM "modifiers" AS m
  WHERE m."restaurant_id" IS NOT NULL
), duplicate_modifiers AS (
  SELECT "id", "canonical_id"
  FROM ranked_modifiers
  WHERE "row_num" > 1
)
INSERT INTO "modifier_group_modifiers" (
  "id",
  "modifier_group_id",
  "modifier_id",
  "sort_order",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  mgm."modifier_group_id",
  dm."canonical_id",
  mgm."sort_order",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "modifier_group_modifiers" AS mgm
INNER JOIN duplicate_modifiers AS dm
  ON dm."id" = mgm."modifier_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "modifier_group_modifiers" AS existing
  WHERE existing."modifier_group_id" = mgm."modifier_group_id"
    AND existing."modifier_id" = dm."canonical_id"
);

WITH ranked_modifiers AS (
  SELECT
    m."id",
    m."restaurant_id",
    m."name",
    FIRST_VALUE(m."id") OVER (
      PARTITION BY m."restaurant_id", m."name"
      ORDER BY
        CASE WHEN m."deleted_at" IS NULL THEN 0 ELSE 1 END,
        CASE WHEN m."is_active" THEN 0 ELSE 1 END,
        m."created_at",
        m."id"
    ) AS "canonical_id",
    ROW_NUMBER() OVER (
      PARTITION BY m."restaurant_id", m."name"
      ORDER BY
        CASE WHEN m."deleted_at" IS NULL THEN 0 ELSE 1 END,
        CASE WHEN m."is_active" THEN 0 ELSE 1 END,
        m."created_at",
        m."id"
    ) AS "row_num"
  FROM "modifiers" AS m
  WHERE m."restaurant_id" IS NOT NULL
), duplicate_modifiers AS (
  SELECT "id", "canonical_id"
  FROM ranked_modifiers
  WHERE "row_num" > 1
)
INSERT INTO "menu_item_modifier_price_overrides" (
  "id",
  "menu_item_id",
  "modifier_id",
  "price_delta"
)
SELECT
  gen_random_uuid()::text,
  mimo."menu_item_id",
  dm."canonical_id",
  mimo."price_delta"
FROM "menu_item_modifier_price_overrides" AS mimo
INNER JOIN duplicate_modifiers AS dm
  ON dm."id" = mimo."modifier_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "menu_item_modifier_price_overrides" AS existing
  WHERE existing."menu_item_id" = mimo."menu_item_id"
    AND existing."modifier_id" = dm."canonical_id"
);

WITH ranked_modifiers AS (
  SELECT
    m."id",
    m."restaurant_id",
    m."name",
    FIRST_VALUE(m."id") OVER (
      PARTITION BY m."restaurant_id", m."name"
      ORDER BY
        CASE WHEN m."deleted_at" IS NULL THEN 0 ELSE 1 END,
        CASE WHEN m."is_active" THEN 0 ELSE 1 END,
        m."created_at",
        m."id"
    ) AS "canonical_id",
    ROW_NUMBER() OVER (
      PARTITION BY m."restaurant_id", m."name"
      ORDER BY
        CASE WHEN m."deleted_at" IS NULL THEN 0 ELSE 1 END,
        CASE WHEN m."is_active" THEN 0 ELSE 1 END,
        m."created_at",
        m."id"
    ) AS "row_num"
  FROM "modifiers" AS m
  WHERE m."restaurant_id" IS NOT NULL
), duplicate_modifiers AS (
  SELECT "id", "canonical_id"
  FROM ranked_modifiers
  WHERE "row_num" > 1
)
INSERT INTO "menu_variation_modifier_price_overrides" (
  "id",
  "variation_id",
  "modifier_id",
  "price_delta"
)
SELECT
  gen_random_uuid()::text,
  mvmpo."variation_id",
  dm."canonical_id",
  mvmpo."price_delta"
FROM "menu_variation_modifier_price_overrides" AS mvmpo
INNER JOIN duplicate_modifiers AS dm
  ON dm."id" = mvmpo."modifier_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "menu_variation_modifier_price_overrides" AS existing
  WHERE existing."variation_id" = mvmpo."variation_id"
    AND existing."modifier_id" = dm."canonical_id"
);

WITH ranked_modifiers AS (
  SELECT
    m."id",
    m."restaurant_id",
    m."name",
    FIRST_VALUE(m."id") OVER (
      PARTITION BY m."restaurant_id", m."name"
      ORDER BY
        CASE WHEN m."deleted_at" IS NULL THEN 0 ELSE 1 END,
        CASE WHEN m."is_active" THEN 0 ELSE 1 END,
        m."created_at",
        m."id"
    ) AS "canonical_id",
    ROW_NUMBER() OVER (
      PARTITION BY m."restaurant_id", m."name"
      ORDER BY
        CASE WHEN m."deleted_at" IS NULL THEN 0 ELSE 1 END,
        CASE WHEN m."is_active" THEN 0 ELSE 1 END,
        m."created_at",
        m."id"
    ) AS "row_num"
  FROM "modifiers" AS m
  WHERE m."restaurant_id" IS NOT NULL
), duplicate_modifiers AS (
  SELECT "id"
  FROM ranked_modifiers
  WHERE "row_num" > 1
)
DELETE FROM "modifier_group_modifiers"
WHERE "modifier_id" IN (SELECT "id" FROM duplicate_modifiers);

WITH ranked_modifiers AS (
  SELECT
    m."id",
    m."restaurant_id",
    m."name",
    ROW_NUMBER() OVER (
      PARTITION BY m."restaurant_id", m."name"
      ORDER BY
        CASE WHEN m."deleted_at" IS NULL THEN 0 ELSE 1 END,
        CASE WHEN m."is_active" THEN 0 ELSE 1 END,
        m."created_at",
        m."id"
    ) AS "row_num"
  FROM "modifiers" AS m
  WHERE m."restaurant_id" IS NOT NULL
), duplicate_modifiers AS (
  SELECT "id"
  FROM ranked_modifiers
  WHERE "row_num" > 1
)
DELETE FROM "menu_item_modifier_price_overrides"
WHERE "modifier_id" IN (SELECT "id" FROM duplicate_modifiers);

WITH ranked_modifiers AS (
  SELECT
    m."id",
    m."restaurant_id",
    m."name",
    ROW_NUMBER() OVER (
      PARTITION BY m."restaurant_id", m."name"
      ORDER BY
        CASE WHEN m."deleted_at" IS NULL THEN 0 ELSE 1 END,
        CASE WHEN m."is_active" THEN 0 ELSE 1 END,
        m."created_at",
        m."id"
    ) AS "row_num"
  FROM "modifiers" AS m
  WHERE m."restaurant_id" IS NOT NULL
), duplicate_modifiers AS (
  SELECT "id"
  FROM ranked_modifiers
  WHERE "row_num" > 1
)
DELETE FROM "menu_variation_modifier_price_overrides"
WHERE "modifier_id" IN (SELECT "id" FROM duplicate_modifiers);

WITH ranked_modifiers AS (
  SELECT
    m."id",
    m."restaurant_id",
    m."name",
    ROW_NUMBER() OVER (
      PARTITION BY m."restaurant_id", m."name"
      ORDER BY
        CASE WHEN m."deleted_at" IS NULL THEN 0 ELSE 1 END,
        CASE WHEN m."is_active" THEN 0 ELSE 1 END,
        m."created_at",
        m."id"
    ) AS "row_num"
  FROM "modifiers" AS m
  WHERE m."restaurant_id" IS NOT NULL
), duplicate_modifiers AS (
  SELECT "id"
  FROM ranked_modifiers
  WHERE "row_num" > 1
)
DELETE FROM "modifiers"
WHERE "id" IN (SELECT "id" FROM duplicate_modifiers);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'modifiers_restaurant_id_fkey'
  ) THEN
    ALTER TABLE "modifiers"
      ADD CONSTRAINT "modifiers_restaurant_id_fkey"
      FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'modifier_group_modifiers_modifier_group_id_fkey'
  ) THEN
    ALTER TABLE "modifier_group_modifiers"
      ADD CONSTRAINT "modifier_group_modifiers_modifier_group_id_fkey"
      FOREIGN KEY ("modifier_group_id") REFERENCES "modifier_groups"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'modifier_group_modifiers_modifier_id_fkey'
  ) THEN
    ALTER TABLE "modifier_group_modifiers"
      ADD CONSTRAINT "modifier_group_modifiers_modifier_id_fkey"
      FOREIGN KEY ("modifier_id") REFERENCES "modifiers"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "modifier_group_modifiers_modifier_group_id_modifier_id_key"
  ON "modifier_group_modifiers"("modifier_group_id", "modifier_id");

CREATE INDEX IF NOT EXISTS "modifier_group_modifiers_modifier_id_idx"
  ON "modifier_group_modifiers"("modifier_id");

DROP INDEX IF EXISTS "modifiers_modifier_group_id_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "modifiers_restaurant_id_name_key"
  ON "modifiers"("restaurant_id", "name");
CREATE INDEX IF NOT EXISTS "modifiers_restaurant_id_sort_order_idx"
  ON "modifiers"("restaurant_id", "sort_order");

ALTER TABLE "modifiers"
  ALTER COLUMN "restaurant_id" SET NOT NULL;

ALTER TABLE "modifiers"
  DROP CONSTRAINT IF EXISTS "modifiers_modifier_group_id_fkey";

ALTER TABLE "modifiers"
  DROP COLUMN IF EXISTS "modifier_group_id";
