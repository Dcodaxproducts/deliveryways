import { ConfigService } from '@nestjs/config';
import { PayoutCredentialsService } from './payout-credentials.service';

describe('PayoutCredentialsService', () => {
  const createService = () =>
    new PayoutCredentialsService({
      get: jest.fn().mockReturnValue(Buffer.alloc(32, 7).toString('base64')),
    } as unknown as ConfigService);

  it('round-trips encrypted credentials without plaintext in storage', () => {
    const service = createService();
    const encrypted = service.encrypt('restaurant-1', 'PAYPAL', {
      clientId: 'client-id',
      clientSecret: 'very-secret',
    });

    expect(encrypted).not.toContain('client-id');
    expect(encrypted).not.toContain('very-secret');
    expect(service.decrypt('restaurant-1', 'PAYPAL', encrypted)).toEqual({
      clientId: 'client-id',
      clientSecret: 'very-secret',
    });
  });

  it('rejects credentials copied to another restaurant', () => {
    const service = createService();
    const encrypted = service.encrypt('restaurant-1', 'PAYPAL', {
      clientSecret: 'very-secret',
    });

    expect(() => service.decrypt('restaurant-2', 'PAYPAL', encrypted)).toThrow(
      'Stored payout credentials could not be decrypted',
    );
  });
});
