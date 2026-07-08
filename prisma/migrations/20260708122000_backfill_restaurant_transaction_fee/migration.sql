-- Backfill the deprecated global service charge into each restaurant's settings as
-- the new restaurant-level transaction fee. Existing restaurant-level settings win.
WITH global_fee AS (
  SELECT
    COALESCE("service_charge_enabled", false) AS is_enabled,
    COALESCE("service_charge_type"::text, 'PERCENTAGE') AS fee_type,
    COALESCE("service_charge_value", 0)::text AS fee_value
  FROM "global_settings"
  WHERE "scope_key" = 'GLOBAL'
  LIMIT 1
)
UPDATE "restaurants" r
SET "settings" = jsonb_set(
  jsonb_set(
    COALESCE(r."settings"::jsonb, '{}'::jsonb),
    '{transactionFee}',
    COALESCE(
      r."settings"::jsonb -> 'transactionFee',
      r."settings"::jsonb -> 'serviceCharge',
      jsonb_build_object(
        'isEnabled', global_fee.is_enabled,
        'type', global_fee.fee_type,
        'value', global_fee.fee_value::numeric
      )
    ),
    true
  ),
  '{serviceCharge}',
  COALESCE(
    r."settings"::jsonb -> 'serviceCharge',
    r."settings"::jsonb -> 'transactionFee',
    jsonb_build_object(
      'isEnabled', global_fee.is_enabled,
      'type', global_fee.fee_type,
      'value', global_fee.fee_value::numeric
    )
  ),
  true
)::jsonb
FROM global_fee
WHERE r."deleted_at" IS NULL;
