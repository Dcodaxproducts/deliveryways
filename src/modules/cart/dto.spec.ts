import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { AddCartItemDto, AddCartItemsBatchDto, QuoteCartDto } from './dto';

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
