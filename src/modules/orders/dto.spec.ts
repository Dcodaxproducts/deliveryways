import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrderTypeEnum } from '../../common/enums';
import { QuoteOrderDto, UpdateOrderStatusDto } from './dto';

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

  it('allows branch acceptance status payload with order time', async () => {
    await expect(
      validationPipe.transform(
        {
          status: OrderStatus.CONFIRMED,
          orderTime: '2026-03-24T19:30:00.000Z',
        },
        {
          type: 'body',
          metatype: UpdateOrderStatusDto,
        },
      ),
    ).resolves.toMatchObject({
      status: OrderStatus.CONFIRMED,
      orderTime: '2026-03-24T19:30:00.000Z',
    });
  });
});
