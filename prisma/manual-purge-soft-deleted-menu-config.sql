BEGIN;

-- Purge soft-deleted modifiers first.
WITH deleted_modifiers AS (
  DELETE FROM modifiers
  WHERE deleted_at IS NOT NULL
  RETURNING id
)
SELECT COUNT(*) AS deleted_modifiers_count FROM deleted_modifiers;

-- Purge soft-deleted modifier groups and their remaining config links.
WITH target_groups AS (
  SELECT id FROM modifier_groups WHERE deleted_at IS NOT NULL
), deleted_group_links AS (
  DELETE FROM menu_item_modifier_groups
  WHERE modifier_group_id IN (SELECT id FROM target_groups)
  RETURNING id
), deleted_groups AS (
  DELETE FROM modifier_groups
  WHERE id IN (SELECT id FROM target_groups)
  RETURNING id
)
SELECT
  (SELECT COUNT(*) FROM deleted_group_links) AS deleted_modifier_group_links_count,
  (SELECT COUNT(*) FROM deleted_groups) AS deleted_modifier_groups_count;

-- Purge soft-deleted menu items only when they are not referenced by order history.
WITH target_items AS (
  SELECT mi.id
  FROM menu_items mi
  WHERE mi.deleted_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM order_items oi
      WHERE oi.menu_item_id = mi.id
    )
), cleared_coupon_scopes AS (
  UPDATE coupons
  SET scope_menu_item_id = NULL
  WHERE scope_menu_item_id IN (SELECT id FROM target_items)
  RETURNING id
), deleted_menu_links AS (
  DELETE FROM restaurant_menu_items
  WHERE menu_item_id IN (SELECT id FROM target_items)
  RETURNING id
), deleted_variations AS (
  DELETE FROM menu_item_variations
  WHERE menu_item_id IN (SELECT id FROM target_items)
  RETURNING id
), deleted_modifier_links AS (
  DELETE FROM menu_item_modifier_groups
  WHERE menu_item_id IN (SELECT id FROM target_items)
  RETURNING id
), deleted_branch_overrides AS (
  DELETE FROM branch_menu_item_overrides
  WHERE menu_item_id IN (SELECT id FROM target_items)
  RETURNING id
), deleted_recipes AS (
  DELETE FROM menu_item_recipes
  WHERE menu_item_id IN (SELECT id FROM target_items)
  RETURNING id
), deleted_items AS (
  DELETE FROM menu_items
  WHERE id IN (SELECT id FROM target_items)
  RETURNING id
)
SELECT
  (SELECT COUNT(*) FROM cleared_coupon_scopes) AS cleared_item_coupon_scopes_count,
  (SELECT COUNT(*) FROM deleted_menu_links) AS deleted_menu_links_count,
  (SELECT COUNT(*) FROM deleted_variations) AS deleted_variations_count,
  (SELECT COUNT(*) FROM deleted_modifier_links) AS deleted_item_modifier_links_count,
  (SELECT COUNT(*) FROM deleted_branch_overrides) AS deleted_item_branch_overrides_count,
  (SELECT COUNT(*) FROM deleted_recipes) AS deleted_item_recipes_count,
  (SELECT COUNT(*) FROM deleted_items) AS deleted_menu_items_count;

-- Purge soft-deleted categories when they no longer have child categories or items.
DO $$
DECLARE
  deleted_in_pass INTEGER := 0;
BEGIN
  LOOP
    WITH target_categories AS (
      SELECT mc.id
      FROM menu_categories mc
      WHERE mc.deleted_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM menu_categories child
          WHERE child.parent_category_id = mc.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM menu_items mi
          WHERE mi.category_id = mc.id
        )
    ), cleared_coupon_scopes AS (
      UPDATE coupons
      SET scope_category_id = NULL
      WHERE scope_category_id IN (SELECT id FROM target_categories)
      RETURNING id
    ), deleted_branch_overrides AS (
      DELETE FROM branch_category_overrides
      WHERE menu_category_id IN (SELECT id FROM target_categories)
      RETURNING id
    ), deleted_categories AS (
      DELETE FROM menu_categories
      WHERE id IN (SELECT id FROM target_categories)
      RETURNING id
    )
    SELECT COUNT(*) INTO deleted_in_pass FROM deleted_categories;

    EXIT WHEN deleted_in_pass = 0;
  END LOOP;
END $$;

SELECT
  (SELECT COUNT(*) FROM menu_categories WHERE deleted_at IS NOT NULL) AS remaining_soft_deleted_categories,
  (SELECT COUNT(*) FROM menu_items WHERE deleted_at IS NOT NULL) AS remaining_soft_deleted_items,
  (SELECT COUNT(*) FROM modifier_groups WHERE deleted_at IS NOT NULL) AS remaining_soft_deleted_modifier_groups,
  (SELECT COUNT(*) FROM modifiers WHERE deleted_at IS NOT NULL) AS remaining_soft_deleted_modifiers;

COMMIT;
