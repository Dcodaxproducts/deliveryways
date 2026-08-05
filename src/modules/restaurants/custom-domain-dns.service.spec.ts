import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveCname } from 'node:dns/promises';
import { CustomDomainDnsService } from './custom-domain-dns.service';

jest.mock('node:dns/promises', () => ({
  resolveCname: jest.fn(),
}));

const mockedResolveCname = jest.mocked(resolveCname);

describe('CustomDomainDnsService', () => {
  it('returns exact CNAME instructions from platform configuration', () => {
    const service = new CustomDomainDnsService(
      new ConfigService({
        CUSTOM_DOMAIN_CNAME_TARGET: 'Storefront.Delivery-Way.DE.',
      }),
    );

    expect(service.getInstructions('order.american-corner.de')).toEqual({
      type: 'CNAME',
      host: 'order.american-corner.de',
      hostLabel: 'order',
      target: 'storefront.delivery-way.de',
    });
  });

  it('verifies a matching CNAME response', async () => {
    mockedResolveCname.mockResolvedValue(['storefront.delivery-way.de.']);
    const service = new CustomDomainDnsService(
      new ConfigService({
        CUSTOM_DOMAIN_CNAME_TARGET: 'storefront.delivery-way.de',
      }),
    );

    await expect(
      service.verify('order.american-corner.de'),
    ).resolves.toMatchObject({ target: 'storefront.delivery-way.de' });
  });

  it('rejects mismatched or unavailable DNS', async () => {
    const service = new CustomDomainDnsService(
      new ConfigService({
        CUSTOM_DOMAIN_CNAME_TARGET: 'storefront.delivery-way.de',
      }),
    );
    mockedResolveCname.mockResolvedValueOnce(['other.example.com']);
    await expect(
      service.verify('order.american-corner.de'),
    ).rejects.toBeInstanceOf(ConflictException);

    mockedResolveCname.mockRejectedValueOnce(new Error('ENOTFOUND'));
    await expect(
      service.verify('order.american-corner.de'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not provide instructions without a configured target', () => {
    const service = new CustomDomainDnsService(new ConfigService({}));

    expect(() => service.getInstructions('order.american-corner.de')).toThrow(
      ServiceUnavailableException,
    );
  });
});
