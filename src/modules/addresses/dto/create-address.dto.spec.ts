import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { CreateAddressDto } from './create-address.dto';

describe('CreateAddressDto', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const bodyMetadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateAddressDto,
  };

  const validAddress = {
    street: 'Marktstraße',
    houseNumber: '40',
    postalCode: '46045',
    city: 'Oberhausen',
    state: 'Nordrhein-Westfalen',
    country: 'Deutschland',
    lat: '51.4965',
    lng: '6.8510',
  };

  it('accepts a street containing a name', async () => {
    await expect(
      validationPipe.transform(validAddress, bodyMetadata),
    ).resolves.toMatchObject(validAddress);
  });

  it('rejects a numeric-only street', async () => {
    await expect(
      validationPipe.transform({ ...validAddress, street: '40' }, bodyMetadata),
    ).rejects.toThrow();
  });
});
