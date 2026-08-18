CREATE SEQUENCE "restaurants_display_number_seq";

ALTER TABLE "restaurants"
ADD COLUMN "display_number" INTEGER;

ALTER SEQUENCE "restaurants_display_number_seq"
OWNED BY "restaurants"."display_number";

ALTER TABLE "restaurants"
ALTER COLUMN "display_number"
SET DEFAULT nextval('"restaurants_display_number_seq"');

UPDATE "restaurants"
SET "display_number" = nextval('"restaurants_display_number_seq"')
WHERE "display_number" IS NULL;

ALTER TABLE "restaurants"
ALTER COLUMN "display_number" SET NOT NULL;

CREATE UNIQUE INDEX "restaurants_display_number_key"
ON "restaurants"("display_number");
