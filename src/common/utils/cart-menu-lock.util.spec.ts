import { lockCartMenuItems } from './cart-menu-lock.util';

describe('lockCartMenuItems', () => {
  it('locks unique menu item ids in sorted order', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);

    await lockCartMenuItems({ $queryRaw: queryRaw } as never, [
      'menu-b',
      'menu-a',
      'menu-b',
    ]);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [query] = queryRaw.mock.calls[0] as [
      { strings: string[]; values: unknown[] },
    ];
    expect(query.values).toEqual([
      'feastflow:cart-menu-item:',
      'menu-a',
      'menu-b',
    ]);
    expect(query.strings.join('')).toContain('ORDER BY menu_item_id');
  });
});
