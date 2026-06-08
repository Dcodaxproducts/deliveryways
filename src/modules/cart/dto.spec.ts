import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { AddCartItemDto } from './dto';

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
});
