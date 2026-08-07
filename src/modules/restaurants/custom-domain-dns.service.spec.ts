import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve4 } from 'node:dns/promises';
import { CustomDomainDnsService } from './custom-domain-dns.service';

jest.mock('node:dns/promises', () => ({
  resolve4: jest.fn(),
}));

const mockedResolve4 = jest.mocked(resolve4);

describe('CustomDomainDnsService', () => {
  it('returns exact apex A-record instructions from platform configuration', () => {
    const service = new CustomDomainDnsService(
      new ConfigService({
        CUSTOM_DOMAIN_A_TARGET: '203.0.113.10',
      }),
    );

    expect(service.getInstructions('american-corner.de')).toEqual({
      type: 'A',
      host: 'american-corner.de',
      hostLabel: '@',
      target: '203.0.113.10',
    });
  });

  it('verifies a matching A-record response', async () => {
    mockedResolve4.mockResolvedValue(['203.0.113.10']);
    const service = new CustomDomainDnsService(
      new ConfigService({
        CUSTOM_DOMAIN_A_TARGET: '203.0.113.10',
      }),
    );

    await expect(service.verify('american-corner.de')).resolves.toMatchObject({
      type: 'A',
      target: '203.0.113.10',
    });
  });

  it('rejects mismatched or unavailable DNS', async () => {
    const service = new CustomDomainDnsService(
      new ConfigService({
        CUSTOM_DOMAIN_A_TARGET: '203.0.113.10',
      }),
    );
    mockedResolve4.mockResolvedValueOnce(['203.0.113.20']);
    await expect(service.verify('american-corner.de')).rejects.toBeInstanceOf(
      ConflictException,
    );

    mockedResolve4.mockRejectedValueOnce(new Error('ENOTFOUND'));
    await expect(service.verify('american-corner.de')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('does not provide instructions without a configured public IPv4 target', () => {
    const missingTargetService = new CustomDomainDnsService(
      new ConfigService({}),
    );
    const invalidTargetService = new CustomDomainDnsService(
      new ConfigService({ CUSTOM_DOMAIN_A_TARGET: 'storefront.example.com' }),
    );

    expect(() =>
      missingTargetService.getInstructions('american-corner.de'),
    ).toThrow(ServiceUnavailableException);
    expect(() =>
      invalidTargetService.getInstructions('american-corner.de'),
    ).toThrow(ServiceUnavailableException);
  });
});
