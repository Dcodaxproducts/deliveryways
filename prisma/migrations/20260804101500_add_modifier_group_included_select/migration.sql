ALTER TABLE "modifier_groups"
ADD COLUMN "included_select" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "modifier_groups"
ADD CONSTRAINT "modifier_groups_included_select_check"
CHECK (
  "included_select" >= 0
  AND "included_select" <= "max_select"
);
