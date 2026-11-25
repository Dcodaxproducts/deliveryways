import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListCustomersDto } from './list-customers.dto';

describe('ListCustomersDto', () => {
  it('transforms all customer filters used by the admin list', async () => {
    const dto = plainToInstance(ListCustomersDto, {
      page: '2',
      limit: '10',
      isGuest: 'false',
      isActive: 'true',
      isVerified: 'false',
      withDeleted: 'true',
      fromDate: '2026-09-01',
      toDate: '2026-11-10',
      sortBy: 'createdAt',
      sortOrder: 'ASC',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      page: 2,
      limit: 10,
      isGuest: false,
      isActive: true,
      isVerified: false,
      withDeleted: true,
      fromDate: '2026-09-01',
      toDate: '2026-11-10',
      sortBy: 'createdAt',
      sortOrder: 'ASC',
    });
  });

  it('rejects invalid dates and unsupported sort fields', async () => {
    const dto = plainToInstance(ListCustomersDto, {
      fromDate: 'not-a-date',
      sortBy: 'password',
    });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['fromDate', 'sortBy']),
    );
  });
});
