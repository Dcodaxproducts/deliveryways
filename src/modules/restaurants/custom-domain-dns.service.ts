import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveCname } from 'node:dns/promises';

export type CustomDomainDnsInstructions = {
  type: 'CNAME';
  host: string;
  hostLabel: string;
  target: string;
};

@Injectable()
export class CustomDomainDnsService {
  constructor(private readonly configService: ConfigService) {}

  getInstructions(customDomain: string): CustomDomainDnsInstructions {
    const target = this.normalizeHostname(
      this.configService.get<string>('CUSTOM_DOMAIN_CNAME_TARGET') ??
        this.configService.get<string>('CUSTOMER_APP_BASE_DOMAIN') ??
        '',
    );
    if (!target) {
      throw new ServiceUnavailableException(
        'Custom-domain DNS target is not configured',
      );
    }

    return {
      type: 'CNAME',
      host: customDomain,
      hostLabel: customDomain.split('.')[0] ?? customDomain,
      target,
    };
  }

  async verify(customDomain: string): Promise<CustomDomainDnsInstructions> {
    const instructions = this.getInstructions(customDomain);

    let records: string[];
    try {
      records = await resolveCname(customDomain);
    } catch {
      throw new ConflictException(
        `DNS is not ready. Add CNAME ${instructions.host} to ${instructions.target} and try again after propagation.`,
      );
    }

    const matches = records.some(
      (record) => this.normalizeHostname(record) === instructions.target,
    );
    if (!matches) {
      throw new ConflictException(
        `DNS CNAME does not point to ${instructions.target}`,
      );
    }

    return instructions;
  }

  private normalizeHostname(value: string): string {
    const trimmed = value.trim().toLowerCase().replace(/\.$/, '');
    if (!trimmed) return '';

    try {
      return new URL(
        trimmed.includes('://') ? trimmed : `https://${trimmed}`,
      ).hostname.replace(/\.$/, '');
    } catch {
      return '';
    }
  }
}
