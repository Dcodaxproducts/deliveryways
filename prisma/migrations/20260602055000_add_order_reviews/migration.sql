CREATE TABLE "order_reviews" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "order_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_reviews_order_id_key" ON "order_reviews"("order_id");
CREATE INDEX "order_reviews_restaurant_id_created_at_idx" ON "order_reviews"("restaurant_id", "created_at");
CREATE INDEX "order_reviews_branch_id_created_at_idx" ON "order_reviews"("branch_id", "created_at");
CREATE INDEX "order_reviews_customer_id_created_at_idx" ON "order_reviews"("customer_id", "created_at");

ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
