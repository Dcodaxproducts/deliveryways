export interface ModifierQuantitySelection {
  modifierGroupId: string;
  modifiers: Array<{
    modifierId: string;
    quantity?: number;
  }>;
}

export interface ModifierQuantityAllocation {
  modifierGroupId: string;
  modifierId: string;
  quantity: number;
  includedQuantity: number;
  chargedQuantity: number;
}

export function allocateIncludedModifierQuantities(
  selections: ModifierQuantitySelection[],
  includedByGroupId: ReadonlyMap<string, number>,
): ModifierQuantityAllocation[] {
  return selections.flatMap((selection) => {
    let remainingIncluded = Math.max(
      0,
      includedByGroupId.get(selection.modifierGroupId) ?? 0,
    );

    return selection.modifiers.map((modifier) => {
      const quantity = modifier.quantity ?? 1;
      const includedQuantity = Math.min(quantity, remainingIncluded);
      remainingIncluded -= includedQuantity;

      return {
        modifierGroupId: selection.modifierGroupId,
        modifierId: modifier.modifierId,
        quantity,
        includedQuantity,
        chargedQuantity: quantity - includedQuantity,
      };
    });
  });
}
