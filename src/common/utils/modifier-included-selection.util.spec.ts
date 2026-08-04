import { allocateIncludedModifierQuantities } from './modifier-included-selection.util';

describe('allocateIncludedModifierQuantities', () => {
  it('includes the first selected units and charges the remainder', () => {
    expect(
      allocateIncludedModifierQuantities(
        [
          {
            modifierGroupId: 'dressings',
            modifiers: [
              { modifierId: 'ranch', quantity: 1 },
              { modifierId: 'caesar', quantity: 2 },
            ],
          },
        ],
        new Map([['dressings', 1]]),
      ),
    ).toEqual([
      {
        modifierGroupId: 'dressings',
        modifierId: 'ranch',
        quantity: 1,
        includedQuantity: 1,
        chargedQuantity: 0,
      },
      {
        modifierGroupId: 'dressings',
        modifierId: 'caesar',
        quantity: 2,
        includedQuantity: 0,
        chargedQuantity: 2,
      },
    ]);
  });

  it('preserves current pricing when the included count is zero', () => {
    expect(
      allocateIncludedModifierQuantities(
        [
          {
            modifierGroupId: 'extras',
            modifiers: [{ modifierId: 'cheese', quantity: 2 }],
          },
        ],
        new Map(),
      )[0],
    ).toMatchObject({
      quantity: 2,
      includedQuantity: 0,
      chargedQuantity: 2,
    });
  });
});
