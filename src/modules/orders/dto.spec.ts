import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrderTypeEnum, PaymentMethodEnum } from '../../common/enums';
import { CreateOrderDto, QuoteOrderDto, UpdateOrderStatusDto } from './dto';

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

  it('allows guest contact and inline delivery address at checkout', async () => {
    await expect(
      validationPipe.transform(
        {
          branchId: 'branch-1',
          orderType: OrderTypeEnum.DELIVERY,
          paymentMethod: PaymentMethodEnum.COD,
          orderTime: '2026-03-24T19:30:00.000Z',
          guestContact: {
            firstName: 'Guest',
            email: 'guest@example.com',
            phone: '+923001234567',
            privacyPolicyAccepted: true,
          },
          guestDeliveryAddress: {
            street: 'Street 12',
            city: 'Lahore',
            state: 'Punjab',
            country: 'Pakistan',
            lat: '31.5204',
            lng: '74.3587',
          },
          items: [{ menuItemId: 'menu-1', quantity: 1 }],
        },
        {
          type: 'body',
          metatype: CreateOrderDto,
        },
      ),
    ).resolves.toMatchObject({
      guestContact: {
        email: 'guest@example.com',
        phone: '+923001234567',
        privacyPolicyAccepted: true,
      },
      guestDeliveryAddress: {
        street: 'Street 12',
        lat: '31.5204',
        lng: '74.3587',
      },
    });
  });
});
