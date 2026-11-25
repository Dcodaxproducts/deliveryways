import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { AdminListCustomersDto } from './dto';

const metadata: ArgumentMetadata = {
  type: 'query',
  metatype: AdminListCustomersDto,
  data: undefined,
};

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  transformOptions: { enableImplicitConversion: true },
});

describe('AdminListCustomersDto', () => {
  it.each([
    ['true', true],
    ['false', false],
  ])(
    'preserves raw isGuest=%s through implicit conversion',
    async (raw, expected) => {
      const dto = (await pipe.transform(
        { page: '1', limit: '20', isGuest: raw },
        metadata,
      )) as AdminListCustomersDto;

      expect(dto.isGuest).toBe(expected);
    },
  );

  it('preserves explicit false account filters', async () => {
    const dto = (await pipe.transform(
      { isGuest: 'false', isVerified: 'false', isActive: 'false' },
      metadata,
    )) as AdminListCustomersDto;

    expect(dto).toMatchObject({
      isGuest: false,
      isVerified: false,
      isActive: false,
    });
  });
});
