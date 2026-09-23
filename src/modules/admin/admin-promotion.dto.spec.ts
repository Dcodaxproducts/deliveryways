import { OrderType } from '@prisma/client';
import { validate } from 'class-validator';
import { UpdateAdminPromotionDto } from './dto';

describe('UpdateAdminPromotionDto', () => {
  it('accepts supported promotion fulfillment types', async () => {
    const dto = Object.assign(new UpdateAdminPromotionDto(), {
      allowedOrderTypes: [OrderType.DELIVERY, OrderType.TAKEAWAY],
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejects an empty promotion fulfillment scope', async () => {
    const dto = Object.assign(new UpdateAdminPromotionDto(), {
      allowedOrderTypes: [],
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'allowedOrderTypes' }),
      ]),
    );
  });
});
