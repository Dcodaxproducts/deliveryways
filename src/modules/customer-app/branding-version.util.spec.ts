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

  it('changes when the same favicon path is replaced', () => {
    const branding = { assets: { faviconUrl: '/favicon.webp' } };

    expect(
      createBrandingVersion(
        'restaurant-1',
        branding,
        new Date('2026-11-26T08:00:00.000Z'),
      ),
    ).not.toBe(
      createBrandingVersion(
        'restaurant-1',
        branding,
        new Date('2026-11-26T09:00:00.000Z'),
      ),
    );
  });

  it('falls back to the legacy favicon when the canonical key is blank', () => {
    const canonicalBlank = createBrandingVersion('restaurant-1', {
      assets: {
        faviconUrl: '',
        logos: { faviconUrl: '/legacy.ico' },
      },
    });
    const nestedOnly = createBrandingVersion('restaurant-1', {
      assets: { logos: { faviconUrl: '/legacy.ico' } },
    });

    expect(canonicalBlank).toBe(nestedOnly);
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
