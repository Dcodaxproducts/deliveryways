ALTER TABLE "menu_items" ADD COLUMN "tax_type_code" VARCHAR(64);
ALTER TABLE "menu_items" ADD COLUMN "tax_percentage" DECIMAL(5,2);
ALTER TABLE "global_settings" ADD COLUMN "tax_types" JSONB;
