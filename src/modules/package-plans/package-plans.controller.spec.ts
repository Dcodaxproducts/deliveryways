import { HEADERS_METADATA } from '@nestjs/common/constants';
import { PublicPackagePlansController } from './package-plans.controller';

describe('PublicPackagePlansController cache contract', () => {
  it('prevents stale landing package-plan responses', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      PublicPackagePlansController.prototype,
      'listPublicPlans',
    );
    expect(descriptor?.value).toBeDefined();
    const headers = Reflect.getMetadata(
      HEADERS_METADATA,
      descriptor?.value as object,
    ) as Array<{ name: string; value: string }> | undefined;

    expect(headers).toEqual(
      expect.arrayContaining([
        { name: 'Cache-Control', value: 'no-store, max-age=0' },
      ]),
    );
  });
});
