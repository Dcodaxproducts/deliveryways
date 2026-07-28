CREATE TYPE "CouponAudience" AS ENUM ('GUEST', 'REGISTERED', 'BOTH');

ALTER TABLE "coupons"
ADD COLUMN "audience" "CouponAudience" NOT NULL DEFAULT 'BOTH';
