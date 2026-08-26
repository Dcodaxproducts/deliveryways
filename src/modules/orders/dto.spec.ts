import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrderTypeEnum, PaymentMethodEnum } from '../../common/enums';
import {
  CreateOrderDto,
  ListOrdersDto,
  QuoteOrderDto,
  UpdateOrderStatusDto,
} from './dto';

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

  it('validates and transforms authoritative order list filters', async () => {
    await expect(
      validationPipe.transform(
        {
          excludeStatus: OrderStatus.PAYMENT_PENDING,
          createdFrom: '2026-08-21T00:00:00.000Z',
          createdTo: '2026-08-21T23:59:59.999Z',
          orderTimeFrom: '2026-08-22T00:00:00.000Z',
          isScheduled: 'true',
        },
        { type: 'query', metatype: ListOrdersDto },
      ),
    ).resolves.toMatchObject({
      excludeStatus: OrderStatus.PAYMENT_PENDING,
      createdFrom: '2026-08-21T00:00:00.000Z',
      createdTo: '2026-08-21T23:59:59.999Z',
      orderTimeFrom: '2026-08-22T00:00:00.000Z',
      isScheduled: true,
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
            firstName: 'Max Mustermann',
            email: 'guest@example.com',
            phone: '+49 151 23456789',
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
        phone: '+49 151 23456789',
        privacyPolicyAccepted: true,
      },
      guestDeliveryAddress: {
        street: 'Street 12',
        lat: '31.5204',
        lng: '74.3587',
      },
    });
  });

  it('rejects generated guest identities and invalid contact details', async () => {
    await expect(
      validationPipe.transform(
        {
          branchId: 'branch-1',
          orderType: OrderTypeEnum.TAKEAWAY,
          paymentMethod: PaymentMethodEnum.COD,
          guestContact: {
            firstName: 'G',
            email: 'guest+restaurant-1@guest.deliveryways.local',
            phone: '123',
            privacyPolicyAccepted: true,
          },
          items: [{ menuItemId: 'menu-1', quantity: 1 }],
        },
        {
          type: 'body',
          metatype: CreateOrderDto,
        },
      ),
    ).rejects.toThrow();
  });

  it('rejects a numeric-only guest delivery street', async () => {
    await expect(
      validationPipe.transform(
        {
          branchId: 'branch-1',
          orderType: OrderTypeEnum.DELIVERY,
          paymentMethod: PaymentMethodEnum.COD,
          guestContact: {
            firstName: 'Max Mustermann',
            email: 'guest@example.com',
            privacyPolicyAccepted: true,
          },
          guestDeliveryAddress: {
            street: '40',
            houseNumber: '40',
            city: 'Oberhausen',
            state: 'Nordrhein-Westfalen',
            country: 'Deutschland',
            lat: '51.4965',
            lng: '6.8510',
          },
          items: [{ menuItemId: 'menu-1', quantity: 1 }],
        },
        {
          type: 'body',
          metatype: CreateOrderDto,
        },
      ),
    ).rejects.toThrow();
  });
});
