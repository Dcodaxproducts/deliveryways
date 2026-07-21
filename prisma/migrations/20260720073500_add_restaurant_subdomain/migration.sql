ALTER TABLE "restaurants"
  ADD COLUMN "subdomain" TEXT,
  ADD COLUMN "custom_domain_verified_at" TIMESTAMP(3);

UPDATE "restaurants"
SET "subdomain" = "slug";

DO $$
DECLARE
  restaurant_record RECORD;
  candidate TEXT;
  suffix INTEGER;
BEGIN
  FOR restaurant_record IN
    SELECT "id", "slug"
    FROM "restaurants"
    WHERE "subdomain" IN ('admin', 'api', 'superadmin', 'www')
  LOOP
    suffix := 2;
    candidate := restaurant_record."slug" || '-' || suffix;

    WHILE EXISTS (
      SELECT 1
      FROM "restaurants"
      WHERE "subdomain" = candidate
        AND "id" <> restaurant_record."id"
    ) LOOP
      suffix := suffix + 1;
      candidate := restaurant_record."slug" || '-' || suffix;
    END LOOP;

    UPDATE "restaurants"
    SET "subdomain" = candidate
    WHERE "id" = restaurant_record."id";
  END LOOP;
END $$;

UPDATE "restaurants"
SET "custom_domain" = NULLIF(
  LOWER(TRIM(TRAILING '.' FROM BTRIM("custom_domain"))),
  ''
)
WHERE "custom_domain" IS NOT NULL;

WITH duplicate_domains AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "custom_domain"
      ORDER BY "created_at", "id"
    ) AS duplicate_number
  FROM "restaurants"
  WHERE "custom_domain" IS NOT NULL
)
UPDATE "restaurants" AS restaurant
SET "custom_domain" = NULL
FROM duplicate_domains
WHERE restaurant."id" = duplicate_domains."id"
  AND duplicate_domains.duplicate_number > 1;

ALTER TABLE "restaurants" ALTER COLUMN "subdomain" SET NOT NULL;

CREATE UNIQUE INDEX "restaurants_subdomain_key"
  ON "restaurants"("subdomain");

CREATE UNIQUE INDEX "restaurants_custom_domain_key"
  ON "restaurants"("custom_domain");
