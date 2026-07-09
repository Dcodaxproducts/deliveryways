import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { CreateRestaurantPayoutRequestDto } from './dto';

describe('Payments DTO validation', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  });

  const payoutRequestBodyMetadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateRestaurantPayoutRequestDto,
  };

  it('allows restaurant payout requests with FE bank details payload', async () => {
    await expect(
      validationPipe.transform(
        {
          amount: 1500,
          currency: 'PKR',
          bankDetails: {
            bankName: 'HBL',
            accountTitle: 'Restaurant Owner',
            accountNumber: '1234567890',
            iban: 'PK36SCBL0000001123456702',
            phone: '03410000000',
          },
          note: 'Weekly payout',
        },
        payoutRequestBodyMetadata,
      ),
    ).resolves.toMatchObject({
      amount: 1500,
      currency: 'PKR',
      bankDetails: {
        bankName: 'HBL',
        accountTitle: 'Restaurant Owner',
        accountNumber: '1234567890',
        iban: 'PK36SCBL0000001123456702',
        phone: '03410000000',
      },
      note: 'Weekly payout',
    });
  });

  it('rejects unsupported bank details fields', async () => {
    try {
      await validationPipe.transform(
        {
          amount: 1500,
          currency: 'PKR',
          bankDetails: {
            bankName: 'HBL',
            accountTitle: 'Restaurant Owner',
            accountNumber: '1234567890',
            routingNumber: 'not-supported',
          },
        },
        payoutRequestBodyMetadata,
      );
      throw new Error('Expected payout bank details validation to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse();
      expect(typeof response).toBe('object');
      expect(response).not.toBeNull();
      const { message } = response as { message?: unknown };
      expect(Array.isArray(message)).toBe(true);
      const messages = message as string[];
      expect(
        messages.some((entry) =>
          entry.includes('property routingNumber should not exist'),
        ),
      ).toBe(true);
    }
  });
});
