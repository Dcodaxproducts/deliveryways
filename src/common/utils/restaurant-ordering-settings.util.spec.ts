import {
  extractRestaurantOrderingSettings,
  mergeRestaurantOrderingSettings,
} from './restaurant-ordering-settings.util';

describe('restaurant ordering settings', () => {
  it('defaults missing flags to enabled', () => {
    expect(extractRestaurantOrderingSettings(null)).toEqual({
      preorderEnabled: true,
      tipsEnabled: true,
    });
    expect(extractRestaurantOrderingSettings({ ordering: {} })).toEqual({
      preorderEnabled: true,
      tipsEnabled: true,
    });
  });

  it('merges only supplied ordering flags and preserves unrelated settings', () => {
    expect(
      mergeRestaurantOrderingSettings(
        {
          currency: 'PKR',
          ordering: {
            preorderEnabled: true,
            tipsEnabled: false,
            internalValue: 'preserved',
          },
        },
        { preorderEnabled: false },
      ),
    ).toEqual({
      currency: 'PKR',
      ordering: {
        preorderEnabled: false,
        tipsEnabled: false,
        internalValue: 'preserved',
      },
    });
  });
});
