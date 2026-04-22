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
