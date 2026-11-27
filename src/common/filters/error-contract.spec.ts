import { HttpStatus } from '@nestjs/common';
import { resolveApiErrorContract } from './error-contract';

describe('resolveApiErrorContract', () => {
  it.each([
    [
      'Choose Sauces requires at least 2 modifier selection(s)',
      'MODIFIER_MIN_SELECTIONS_NOT_MET',
      { groupName: 'Choose Sauces', minSelections: 2 },
    ],
    [
      'Choose Sauces allows at most 3 modifier selection(s)',
      'MODIFIER_MAX_SELECTIONS_EXCEEDED',
      { groupName: 'Choose Sauces', maxSelections: 3 },
    ],
    [
      'Basic Pizza requires modifier selection(s): Size, Crust',
      'MODIFIER_SELECTION_REQUIRED',
      {
        itemName: 'Basic Pizza',
        modifierNames: ['Size', 'Crust'],
      },
    ],
    [
      'Flexible deal requires at least 3 eligible item(s)',
      'MINIMUM_ITEM_QUANTITY_NOT_MET',
      { itemName: 'Flexible deal', minQuantity: 3 },
    ],
  ])('maps modifier contract %s', (message, code, params) => {
    expect(resolveApiErrorContract(message, 400)).toEqual({
      code,
      params,
    });
  });

  it.each([
    ['Tenant context is required', 'TENANT_CONTEXT_REQUIRED'],
    ['Order not found', 'ORDER_NOT_FOUND'],
    ['Payment transaction not found', 'PAYMENT_NOT_FOUND'],
    ['Menu item is unavailable', 'MENU_UNAVAILABLE'],
    ['Address not found', 'ADDRESS_NOT_FOUND'],
    ['Invalid credentials', 'INVALID_CREDENTIALS'],
    ['Missing access token', 'AUTHENTICATION_REQUIRED'],
  ])('maps domain contract %s', (message, code) => {
    expect(resolveApiErrorContract(message, HttpStatus.BAD_REQUEST)).toEqual({
      code,
    });
  });

  it('moves raw required property names into structured params', () => {
    expect(
      resolveApiErrorContract(
        'restaurantId is required',
        HttpStatus.BAD_REQUEST,
      ),
    ).toEqual({
      code: 'REQUIRED_FIELD_MISSING',
      params: { field: 'restaurantId' },
    });
  });

  it('preserves explicit stable domain codes', () => {
    expect(
      resolveApiErrorContract(
        'Legacy copy can change',
        HttpStatus.BAD_REQUEST,
        'MINIMUM_ORDER_AMOUNT_NOT_MET',
      ),
    ).toEqual({ code: 'MINIMUM_ORDER_AMOUNT_NOT_MET' });
  });

  it('rejects Nest default prose as an error code', () => {
    expect(
      resolveApiErrorContract(
        'Unexpected request',
        HttpStatus.BAD_REQUEST,
        'Bad Request',
      ),
    ).toEqual({ code: 'BAD_REQUEST' });
  });
});
