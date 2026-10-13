import { Prisma } from '@prisma/client';
import { PrismaTx } from '../types';

const CART_MENU_LOCK_NAMESPACE = 'feastflow:cart-menu-item:';

export async function lockCartMenuItems(
  tx: PrismaTx,
  menuItemIds: string[],
): Promise<void> {
  const sortedIds = [...new Set(menuItemIds)].sort();
  if (!sortedIds.length) {
    return;
  }

  await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${CART_MENU_LOCK_NAMESPACE} || menu_item_id, 0)
    ) IS NULL AS locked
    FROM (
      SELECT menu_item_id
      FROM unnest(ARRAY[${Prisma.join(sortedIds)}]::text[])
        AS input(menu_item_id)
      ORDER BY menu_item_id
    ) AS ordered_menu_items
  `);
}
