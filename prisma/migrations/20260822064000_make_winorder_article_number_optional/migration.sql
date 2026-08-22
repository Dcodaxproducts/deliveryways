-- WinOrder recommends article-name matching for the normal productive flow.
-- Existing article numbers are preserved; overrides may now contain only a name.
-- Rollback requires backfilling null values before restoring NOT NULL.
ALTER TABLE "winorder_catalog_mappings"
ALTER COLUMN "external_article_no" DROP NOT NULL;
