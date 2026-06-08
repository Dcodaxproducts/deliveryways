import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { OrderTypeEnum } from '../../common/enums';
import { QuoteOrderDto } from './dto';

describe('Order DTO validation', () => {
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
    metatype: QuoteOrderDto,
  };

  it('allows grouped modifier selections in quote items', async () => {
    await expect(
      validationPipe.transform(
        {
          branchId: 'branch-1',
          orderType: OrderTypeEnum.DELIVERY,
          orderTime: '2026-03-24T19:30:00.000Z',
          items: [
            {
              menuItemId: 'menu-1',
              quantity: 1,
              modifierSelections: [
                {
                  modifierGroupId: 'group-1',
                  modifiers: [{ modifierId: 'modifier-1', quantity: 2 }],
                },
              ],
            },
          ],
        },
        bodyMetadata,
      ),
    ).resolves.toMatchObject({
      items: [
        {
          modifierSelections: [
            {
              modifierGroupId: 'group-1',
              modifiers: [{ modifierId: 'modifier-1', quantity: 2 }],
            },
          ],
        },
      ],
    });
  });
});
