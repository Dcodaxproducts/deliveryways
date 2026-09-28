import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import {
  AddCartItemDto,
  AddCartItemsBatchDto,
  CheckoutCartDto,
  QuoteCartDto,
} from './dto';

describe('Cart DTO validation', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  });

  const bodyMetadata: ArgumentMetadata = {
    type: 'body',
    metatype: AddCartItemDto,
  };

  it('allows grouped modifier selections when adding an item', async () => {
    await expect(
      validationPipe.transform(
        {
          branchId: 'branch-1',
          menuItemId: 'menu-1',
          quantity: 1,
          modifierSelections: [
            {
              modifierGroupId: 'group-1',
              modifiers: [{ modifierId: 'modifier-1', quantity: 2 }],
            },
          ],
        },
        bodyMetadata,
      ),
    ).resolves.toMatchObject({
      modifierSelections: [
        {
          modifierGroupId: 'group-1',
          modifiers: [{ modifierId: 'modifier-1', quantity: 2 }],
        },
      ],
    });
  });

  it('allows an inline guest delivery address when quoting a cart', async () => {
    await expect(
      validationPipe.transform(
        {
          guestDeliveryAddress: {
            street: 'Ghori Town Main Road',
            houseNumber: '20',
            postalCode: '45327',
            city: 'Zone IV',
            state: 'Islamabad',
            country: 'Pakistan',
            lat: '33.601',
            lng: '73.167',
          },
        },
        {
          ...bodyMetadata,
          metatype: QuoteCartDto,
        },
      ),
    ).resolves.toMatchObject({
      guestDeliveryAddress: {
        postalCode: '45327',
      },
    });
  });

  it('requires a UUID key and exact cart identity for checkout', async () => {
    const checkoutMetadata = {
      ...bodyMetadata,
      metatype: CheckoutCartDto,
    };

    await expect(
      validationPipe.transform(
        {
          idempotencyKey: '8b5cb490-a31b-4d88-a8db-776e8a6eb1cb',
          cartId: 'cart-1',
          cartVersion: '2026-09-28T06:00:00.000Z',
          paymentMethod: 'COD',
        },
        checkoutMetadata,
      ),
    ).resolves.toMatchObject({ cartId: 'cart-1' });

    await expect(
      validationPipe.transform({ paymentMethod: 'COD' }, checkoutMetadata),
    ).rejects.toBeDefined();
  });

  it('rejects cart batches larger than 25 items', async () => {
    await expect(
      validationPipe.transform(
        {
          items: Array.from({ length: 26 }, (_, index) => ({
            menuItemId: `menu-${index}`,
            quantity: 1,
          })),
        },
        { ...bodyMetadata, metatype: AddCartItemsBatchDto },
      ),
    ).rejects.toBeDefined();
  });
});
