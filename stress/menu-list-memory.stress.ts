import { RestaurantMenuRepository } from '../src/modules/menu/restaurant-menu/restaurant-menu.repository';

const PAGE_SIZE = 100;
const REQUEST_COUNT = 200;
const CONCURRENCY = 20;
const MAX_HEAP_DELTA_BYTES = 64 * 1024 * 1024;
const MAX_RSS_DELTA_BYTES = 128 * 1024 * 1024;

const ids = Array.from({ length: PAGE_SIZE }, (_, index) => `item-${index}`);
let pageQueryCount = 0;
let hydrationQueryCount = 0;
let countQueryCount = 0;
let maximumHydrationIds = 0;
let observedCategoryItemsInclude = false;
let observedTransaction = false;

const prisma = {
  menuItem: {
    findMany: (query: {
      select?: { id?: boolean };
      where?: { id?: { in?: string[] } };
      include?: {
        category?: { select?: Record<string, unknown> };
      };
    }) => {
      if (query.select?.id) {
        pageQueryCount += 1;
        return Promise.resolve(ids.map((id) => ({ id })));
      }

      hydrationQueryCount += 1;
      const hydrationIds = query.where?.id?.in ?? [];
      maximumHydrationIds = Math.max(maximumHydrationIds, hydrationIds.length);
      observedCategoryItemsInclude ||= Boolean(
        query.include?.category?.select &&
        Object.prototype.hasOwnProperty.call(
          query.include.category.select,
          'items',
        ),
      );

      return Promise.resolve(
        hydrationIds.map((id) => ({
          id,
          categoryId: 'category-1',
          name: `Item ${id}`,
          slug: id,
          description: 'bounded menu item',
          imageUrl: null,
          sku: id,
          basePrice: 10,
          depositAmount: 0,
          prepTimeMinutes: 10,
          isActive: true,
          category: {
            id: 'category-1',
            name: 'Category',
            slug: 'category',
            imageUrl: null,
            variations: [],
            variationLinks: [],
            modifierLinks: [],
          },
          menuLinks: [{ id: `link-${id}`, sortOrder: 0, isActive: true }],
          modifierLinks: [],
          modifierPriceOverrides: [],
        })),
      );
    },
    count: () => {
      countQueryCount += 1;
      return Promise.resolve(PAGE_SIZE);
    },
  },
  restaurantMenuCategory: {
    findMany: () => Promise.resolve([]),
  },
  $transaction: () => {
    observedTransaction = true;
    return Promise.reject(
      new Error('Menu listing must not open a transaction'),
    );
  },
};

const main = async () => {
  const repository = new RestaurantMenuRepository(prisma as never);
  const memoryBefore = process.memoryUsage();
  let peakRss = memoryBefore.rss;
  let peakHeap = memoryBefore.heapUsed;
  const sampleMemory = () => {
    const memory = process.memoryUsage();
    peakRss = Math.max(peakRss, memory.rss);
    peakHeap = Math.max(peakHeap, memory.heapUsed);
  };

  const runRequest = async () => {
    const result = await repository.listMenuItems('menu-1', {
      page: 1,
      limit: PAGE_SIZE,
      sortBy: 'sortOrder',
      sortOrder: 'ASC',
    } as never);
    const serialized = JSON.stringify(result);
    if (result.items.length !== PAGE_SIZE || serialized.length === 0) {
      throw new Error('Menu response behavior changed during stress run');
    }
  };

  const startedAt = Date.now();
  for (let offset = 0; offset < REQUEST_COUNT; offset += CONCURRENCY) {
    await Promise.all(
      Array.from(
        { length: Math.min(CONCURRENCY, REQUEST_COUNT - offset) },
        runRequest,
      ),
    );
    sampleMemory();
  }
  if (global.gc) global.gc();
  const memoryAfter = process.memoryUsage();
  const heapDelta = peakHeap - memoryBefore.heapUsed;
  const rssDelta = peakRss - memoryBefore.rss;

  if (
    pageQueryCount !== REQUEST_COUNT ||
    hydrationQueryCount !== REQUEST_COUNT ||
    countQueryCount !== REQUEST_COUNT
  ) {
    throw new Error('Unexpected menu query count');
  }
  if (maximumHydrationIds > PAGE_SIZE) {
    throw new Error('Hydration escaped the requested page bound');
  }
  if (observedCategoryItemsInclude || observedTransaction) {
    throw new Error('Unbounded relation or transaction regression detected');
  }
  if (heapDelta > MAX_HEAP_DELTA_BYTES || rssDelta > MAX_RSS_DELTA_BYTES) {
    throw new Error(
      `Memory bound exceeded: heapDelta=${heapDelta}, rssDelta=${rssDelta}`,
    );
  }

  process.stdout.write(
    `
  MENU_MEMORY_STRESS ${JSON.stringify({
    requests: REQUEST_COUNT,
    concurrency: CONCURRENCY,
    pageSize: PAGE_SIZE,
    pageQueryCount,
    hydrationQueryCount,
    countQueryCount,
    maximumHydrationIds,
    elapsedMs: Date.now() - startedAt,
    heapDeltaBytes: heapDelta,
    rssDeltaBytes: rssDelta,
    finalHeapUsedBytes: memoryAfter.heapUsed,
    finalRssBytes: memoryAfter.rss,
  })}
  `,
  );
};

void main();
