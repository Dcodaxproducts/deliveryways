-- Link export records to their source orders so acknowledged exports can be
-- excluded before polling pagination. NOT VALID avoids scanning historical
-- rows while immediately enforcing the relationship for new writes.
ALTER TABLE "winorder_order_exports"
ADD CONSTRAINT "winorder_order_exports_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "orders"("id")
ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
