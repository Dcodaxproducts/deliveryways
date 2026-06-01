import { Injectable, NotFoundException } from '@nestjs/common';

interface ImportSampleDefinition {
  fileName: string;
  rows: Array<Record<string, unknown>>;
}

export type ImportSampleType =
  | 'menu'
  | 'menu-items'
  | 'deliverymen'
  | 'coupons'
  | 'promotions'
  | 'happy-hours';

@Injectable()
export class AdminImportSamplesService {
  private readonly samples: Record<ImportSampleType, ImportSampleDefinition> = {
    menu: {
      fileName: 'menu-import-sample.csv',
      rows: [
        {
          restaurantId: 'restaurant_123',
          name: 'Lunch Menu',
          slug: 'lunch-menu',
          description: 'Available on weekdays from 12 PM to 4 PM',
          itemIds: 'item_101|item_102',
          categoryIds: 'cat_101|cat_102',
          isTimed: true,
          timingConfig:
            '{"days":[1,2,3,4,5],"startTime":"12:00","endTime":"16:00"}',
          sortOrder: 1,
          isActive: true,
        },
      ],
    },
    'menu-items': {
      fileName: 'menu-items-import-sample.csv',
      rows: [
        {
          restaurantId: 'restaurant_123',
          categoryId: 'cat_101',
          categoryIds: 'cat_101|cat_102',
          name: 'Chicken Burger',
          slug: 'chicken-burger',
          description: 'Crispy chicken burger with fries',
          ingredients: 'Chicken, bun, lettuce, sauce',
          nutritionalInformation: '650 kcal',
          imageUrl: 'https://cdn.example.com/chicken-burger.jpg',
          sku: 'BURGER-001',
          sortOrder: 1,
          pricingMode: 'SINGLE',
          basePrice: 1299,
          deliveryPriceAdjustment: 0,
          takeawayPriceAdjustment: 0,
          prepTimeMinutes: 20,
          dietaryFlags: 'HALAL|SPICY',
          labels: 'SPICY',
          allergenFlags: 'GLUTEN|EGG',
          allergenCodes: 'A1|E1',
          depositAmount: 0,
          minQuantity: 1,
          maxQuantity: 10,
          minSelect: 0,
          maxSelect: 3,
          supportsSplitPizza: false,
          isRequired: false,
          isActive: true,
          modifiers: '[{"modifierId":"mod_101","priceDelta":150}]',
          variationPriceOverrides:
            '[{"variationId":"var_101","price":1499,"pickupPrice":1399,"displayText":"Large"}]',
        },
      ],
    },
    deliverymen: {
      fileName: 'deliverymen-import-sample.csv',
      rows: [
        {
          restaurantId: 'restaurant_123',
          branchId: 'branch_123',
          firstName: 'Ali',
          lastName: 'Khan',
          email: 'ali.rider@example.com',
          phone: '+923001234567',
          vehicleType: 'BIKE',
          vehicleNumber: 'ABC-123',
          password: 'Temp@12345',
          status: 'OFFLINE',
        },
      ],
    },
    coupons: {
      fileName: 'coupons-import-sample.csv',
      rows: [
        {
          restaurantId: 'restaurant_123',
          branchId: 'branch_123',
          code: 'SAVE20',
          title: 'Save 20 percent',
          description: '20% discount on orders above 1000',
          discountType: 'PERCENTAGE',
          discountValue: 20,
          maxDiscountAmount: 500,
          minOrderAmount: 1000,
          maxUses: 100,
          maxUsesPerCustomer: 1,
          startsAt: '2026-06-01T00:00:00.000Z',
          expiresAt: '2026-06-30T23:59:59.000Z',
          scopeMenuItemId: '',
          scopeCategoryId: '',
        },
      ],
    },
    promotions: {
      fileName: 'promotions-import-sample.csv',
      rows: [
        {
          restaurantId: 'restaurant_123',
          branchId: 'branch_123',
          code: 'PROMO20',
          title: 'Weekend Deal',
          description: 'Auto-applied weekend promotion',
          discountType: 'PERCENTAGE',
          discountValue: 20,
          maxDiscountAmount: 500,
          minOrderAmount: 1500,
          maxUses: 200,
          maxUsesPerCustomer: 2,
          startsAt: '2026-06-01T00:00:00.000Z',
          expiresAt: '2026-06-30T23:59:59.000Z',
          scopeMenuItemId: '',
          scopeCategoryId: '',
          scopeMenuItemIds: 'item_101|item_102',
          scopeCategoryIds: 'cat_101',
          applyMode: 'SCOPED_ITEMS',
          autoApply: true,
          isActive: true,
        },
      ],
    },
    'happy-hours': {
      fileName: 'happy-hours-import-sample.csv',
      rows: [
        {
          restaurantId: 'restaurant_123',
          branchId: 'branch_123',
          code: 'HAPPY50',
          title: 'Evening Happy Hour',
          description: '50% off selected items from 4 PM to 6 PM',
          discountType: 'PERCENTAGE',
          discountValue: 50,
          maxDiscountAmount: 1000,
          minOrderAmount: 0,
          maxUses: 100,
          maxUsesPerCustomer: 1,
          startsAt: '2026-06-01T00:00:00.000Z',
          expiresAt: '2026-06-30T23:59:59.000Z',
          activeDays: '1|2|3|4|5',
          dailyStartTime: '16:00',
          dailyEndTime: '18:00',
          scopeMenuItemIds: 'item_101|item_102',
          scopeCategoryIds: 'cat_101',
          applyMode: 'SCOPED_ITEMS',
          autoApply: true,
          isActive: true,
        },
      ],
    },
  };

  getSample(type: string) {
    if (!this.isSampleType(type)) {
      throw new NotFoundException('Import sample not found');
    }

    const sample = this.samples[type];

    return {
      fileName: sample.fileName,
      mimeType: 'text/csv',
      content: Buffer.from(this.toCsv(sample.rows), 'utf8'),
    };
  }

  listSamples() {
    return {
      data: Object.entries(this.samples).map(([type, sample]) => ({
        type,
        fileName: sample.fileName,
        downloadPath: `/api/v1/admin/import-samples/${type}/download`,
      })),
      message: 'Import samples fetched successfully',
    };
  }

  private isSampleType(type: string): type is ImportSampleType {
    return Object.prototype.hasOwnProperty.call(this.samples, type);
  }

  private toCsv(rows: Array<Record<string, unknown>>) {
    if (!rows.length) {
      return '';
    }

    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((header) => this.escapeCsvValue(row[header])).join(','),
      ),
    ];

    return `${lines.join('\n')}\n`;
  }

  private escapeCsvValue(value: unknown) {
    if (value === null || value === undefined) {
      return '';
    }

    let rawValue: string;
    if (typeof value === 'object') {
      rawValue = JSON.stringify(value);
    } else if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      rawValue = value.toString();
    } else {
      rawValue = '';
    }
    const normalized = rawValue.replace(/"/g, '""');

    return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
  }
}
