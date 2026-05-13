CREATE TYPE "PackageCommissionType" AS ENUM ('PERCENTAGE', 'FIXED');

ALTER TABLE "package_plans"
  ADD COLUMN "commission_type" "PackageCommissionType" NOT NULL DEFAULT 'PERCENTAGE',
  ADD COLUMN "commission_fixed_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
