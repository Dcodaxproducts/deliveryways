ALTER TABLE "coupons"
ADD COLUMN "allowed_order_types" "OrderType"[] NOT NULL
DEFAULT ARRAY['DELIVERY', 'TAKEAWAY', 'DINE_IN']::"OrderType"[];

ALTER TABLE "package_plans"
ADD COLUMN "show_on_landing" BOOLEAN NOT NULL DEFAULT false;
