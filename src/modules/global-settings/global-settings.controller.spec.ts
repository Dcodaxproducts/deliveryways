import { HEADERS_METADATA } from '@nestjs/common/constants';
import { GlobalSettingsController } from './global-settings.controller';

describe('GlobalSettingsController landing page cache contract', () => {
  it('prevents stale public landing settings responses', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      GlobalSettingsController.prototype,
      'getPublicLandingPageSettings',
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
