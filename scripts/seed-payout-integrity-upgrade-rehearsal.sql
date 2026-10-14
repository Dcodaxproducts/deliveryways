INSERT INTO tenants(id,name,slug,updated_at) VALUES ('upgrade-tenant','Upgrade','upgrade',now());
INSERT INTO restaurants(id,tenant_id,name,slug,subdomain,updated_at) VALUES ('upgrade-restaurant','upgrade-tenant','Upgrade','upgrade-r','upgrade-r',now());
INSERT INTO branches(id,tenant_id,restaurant_id,name,updated_at) VALUES ('upgrade-branch','upgrade-tenant','upgrade-restaurant','Main',now());
INSERT INTO coupons(id,tenant_id,restaurant_id,branch_id,code,title,kind,discount_type,discount_value,updated_at)
SELECT 'gift-'||g,'upgrade-tenant','upgrade-restaurant','upgrade-branch','GIFT-'||g,'Gift '||g,'GIFT_CARD','FLAT',10,now() FROM generate_series(1,200) g;
INSERT INTO payment_transactions(id,tenant_id,restaurant_id,branch_id,payment_method,type,status,amount,currency,provider_data,updated_at)
SELECT 'gift-payment-'||g,'upgrade-tenant','upgrade-restaurant','upgrade-branch','STRIPE','CHARGE','PAID',10,'EUR',jsonb_build_object('giftCardId','gift-'||g),now() FROM generate_series(1,200) g;
INSERT INTO payment_transactions(id,tenant_id,restaurant_id,branch_id,payment_method,type,status,amount,currency,updated_at)
SELECT 'refund-'||g,'upgrade-tenant','upgrade-restaurant','upgrade-branch','STRIPE','REFUND',CASE WHEN g%2=0 THEN 'REFUNDED'::"PaymentStatus" ELSE 'PENDING'::"PaymentStatus" END,1,'EUR',now() FROM generate_series(1,200) g;
