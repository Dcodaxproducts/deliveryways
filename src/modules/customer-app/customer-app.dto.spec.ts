import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePublicTableReservationDto } from './dto';

const validInput = {
  restaurantId: 'restaurant-1',
  branchId: 'branch-1',
  reservationDate: '2099-03-30T19:30:00.000Z',
  guestCount: 4,
  guestName: ' Ali   Khan ',
  guestEmail: 'ALI@EXAMPLE.COM',
  guestPhone: '+49 (170) 123-4567',
  clientRequestId: '0f26c438-f7e0-4caf-aab4-c43b116b5723',
};

const errorsFor = async (overrides: Record<string, unknown>) => {
  const dto = plainToInstance(CreatePublicTableReservationDto, {
    ...validInput,
    ...overrides,
  });
  return { dto, errors: await validate(dto) };
};

describe('CreatePublicTableReservationDto', () => {
  it('normalizes guest contact fields', async () => {
    const { dto, errors } = await errorsFor({});
    expect(errors).toHaveLength(0);
    expect(dto.guestName).toBe('Ali Khan');
    expect(dto.guestEmail).toBe('ali@example.com');
    expect(dto.guestPhone).toBe('+491701234567');
  });

  it.each([
    ['guestName', ''],
    ['guestEmail', 'invalid'],
    ['guestPhone', '12'],
    ['guestName', 'x'.repeat(101)],
    ['guestEmail', `${'x'.repeat(245)}@example.com`],
  ])('rejects invalid or oversized %s', async (field, value) => {
    const { errors } = await errorsFor({ [field]: value });
    expect(errors.some((error) => error.property === field)).toBe(true);
  });

  it('preserves unbounded legacy note compatibility', async () => {
    const { errors } = await errorsFor({ note: 'x'.repeat(501) });
    expect(errors.some((error) => error.property === 'note')).toBe(false);
  });
});
