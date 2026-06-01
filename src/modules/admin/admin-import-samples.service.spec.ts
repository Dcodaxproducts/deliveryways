import { NotFoundException } from '@nestjs/common';
import { AdminImportSamplesService } from './admin-import-samples.service';

describe('AdminImportSamplesService', () => {
  const service = new AdminImportSamplesService();

  it('lists all supported sample files', () => {
    const result = service.listSamples();

    expect(result.data.map((item) => item.type)).toEqual([
      'menu',
      'menu-items',
      'deliverymen',
      'coupons',
      'promotions',
      'happy-hours',
    ]);
  });

  it('returns CSV content for menu item sample', () => {
    const result = service.getSample('menu-items');
    const csv = result.content.toString('utf8');

    expect(result.fileName).toBe('menu-items-import-sample.csv');
    expect(result.mimeType).toBe('text/csv');
    expect(csv).toContain('restaurantId,categoryId,categoryIds,name');
    expect(csv).toContain('Chicken Burger');
  });

  it('rejects unknown sample type', () => {
    expect(() => service.getSample('unknown')).toThrow(NotFoundException);
  });
});
