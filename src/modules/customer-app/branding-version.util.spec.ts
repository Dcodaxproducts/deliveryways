import { createBrandingVersion } from './branding-version.util';

describe('createBrandingVersion', () => {
  it('changes when a tenant replaces or clears its favicon', () => {
    const first = createBrandingVersion('restaurant-1', {
      assets: { faviconUrl: 'https://cdn.example.com/first.webp' },
    });
    const replacement = createBrandingVersion('restaurant-1', {
      assets: { faviconUrl: 'https://cdn.example.com/replacement.webp' },
    });
    const cleared = createBrandingVersion('restaurant-1', {
      assets: { faviconUrl: '' },
    });

    expect(new Set([first, replacement, cleared]).size).toBe(3);
  });

  it('isolates identical favicon values between restaurants', () => {
    const branding = { assets: { faviconUrl: '/shared-name.webp' } };

    expect(createBrandingVersion('restaurant-1', branding)).not.toBe(
      createBrandingVersion('restaurant-2', branding),
    );
  });

  it('supports the legacy nested favicon key deterministically', () => {
    const branding = {
      assets: { logos: { faviconUrl: '/legacy.ico' } },
    };

    expect(createBrandingVersion('restaurant-1', branding)).toBe(
      createBrandingVersion('restaurant-1', branding),
    );
  });
});
