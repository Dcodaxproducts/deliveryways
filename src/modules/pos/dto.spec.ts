import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { CreatePosDraftItemDto } from './dto';

describe('POS DTO validation', () => {
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
    metatype: CreatePosDraftItemDto,
  };

  it('allows flat grouped modifier selections when adding a draft item', async () => {
    await expect(
      validationPipe.transform(
        {
          menuItemId: 'menu-1',
          quantity: 1,
          modifierSelections: [
            {
              modifierGroupId: 'group-1',
              modifierId: 'modifier-1',
              quantity: 2,
            },
          ],
        },
        bodyMetadata,
      ),
    ).resolves.toMatchObject({
      modifierSelections: [
        {
          modifierGroupId: 'group-1',
          modifierId: 'modifier-1',
          quantity: 2,
        },
      ],
    });
  });
});
