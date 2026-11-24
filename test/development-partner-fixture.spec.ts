import {
  assertPartnerFixtureSafety,
  PARTNER_FIXTURE_CONFIRMATION,
  validatePartnerFixtureTarget,
} from '../prisma/fixtures/development-partner.fixture';

describe('development partner fixture safety', () => {
  const safe = {
    nodeEnv: 'development',
    confirmation: PARTNER_FIXTURE_CONFIRMATION,
    databaseUrl:
      'postgresql://deliveryway_development:secret@postgres:5432/deliveryway_development',
  };

  it('accepts the development Docker database with exact confirmation', () => {
    expect(assertPartnerFixtureSafety(safe).hostname).toBe('postgres');
  });

  it.each([
    [{ ...safe, nodeEnv: 'production' }],
    [{ ...safe, confirmation: 'yes' }],
    [
      {
        ...safe,
        databaseUrl:
          'postgresql://user:secret@prod-db:5432/deliveryway_development',
      },
    ],
    [
      {
        ...safe,
        databaseUrl: 'postgresql://user:secret@postgres:5432/deliveryway',
      },
    ],
    [
      {
        ...safe,
        databaseUrl:
          'postgresql://user:secret@postgres:5432/deliveryway_staging',
      },
    ],
  ])('rejects unsafe configuration %#', (input) => {
    expect(() => assertPartnerFixtureSafety(input)).toThrow(
      'Partner fixture refused',
    );
  });

  it('requires and normalizes the target', () => {
    expect(
      validatePartnerFixtureTarget({
        tenantId: ' tenant ',
        restaurantId: ' restaurant ',
        partnerEmail: ' Partner@Example.com ',
      }),
    ).toEqual({
      tenantId: 'tenant',
      restaurantId: 'restaurant',
      partnerEmail: 'partner@example.com',
    });
  });
});
