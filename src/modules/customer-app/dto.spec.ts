import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ListTableReservationsQueryDto } from './dto';

describe('ListTableReservationsQueryDto', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  const transform = (value: Record<string, unknown>) =>
    pipe.transform(value, {
      type: 'query',
      metatype: ListTableReservationsQueryDto,
    });

  it('accepts and transforms pagination, customer scope, and status filters', async () => {
    await expect(
      transform({
        page: '2',
        limit: '20',
        customerId: 'customer-1',
        status: 'CONFIRMED',
      }),
    ).resolves.toMatchObject({
      page: 2,
      limit: 20,
      customerId: 'customer-1',
      status: 'CONFIRMED',
    });
  });

  it('uses reservation list pagination defaults', async () => {
    await expect(transform({})).resolves.toMatchObject({ page: 1, limit: 20 });
  });

  it.each([
    [{ page: '0' }],
    [{ limit: '0' }],
    [{ limit: '51' }],
    [{ status: 'UNKNOWN' }],
  ])('rejects invalid bounds or filters: %p', async (query) => {
    await expect(transform(query)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown query fields', async () => {
    await expect(
      transform({ page: '1', unknown: 'value' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
