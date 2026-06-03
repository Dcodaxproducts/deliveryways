-- CreateEnum
CREATE TYPE "LocalizationEntityType" AS ENUM (
    'RESTAURANT',
    'BRANCH',
    'RESTAURANT_MENU',
    'MENU_CATEGORY',
    'MENU_ITEM',
    'MENU_ITEM_VARIATION',
    'MODIFIER_GROUP',
    'MODIFIER',
    'COUPON'
);

-- CreateTable
CREATE TABLE "entity_translations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "entity_type" "LocalizationEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "locale" VARCHAR(16) NOT NULL,
    "fields" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" VARCHAR(191),
    "updated_by" VARCHAR(191),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "entity_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entity_translations_restaurant_id_entity_type_entity_id_locale_key"
ON "entity_translations"("restaurant_id", "entity_type", "entity_id", "locale");

-- CreateIndex
CREATE INDEX "entity_translations_tenant_id_restaurant_id_locale_idx"
ON "entity_translations"("tenant_id", "restaurant_id", "locale");

-- CreateIndex
CREATE INDEX "entity_translations_entity_type_entity_id_locale_idx"
ON "entity_translations"("entity_type", "entity_id", "locale");

-- AddForeignKey
ALTER TABLE "entity_translations"
ADD CONSTRAINT "entity_translations_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_translations"
ADD CONSTRAINT "entity_translations_restaurant_id_fkey"
FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
