import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve4 } from 'node:dns/promises';
import { isIP } from 'node:net';

export type CustomDomainDnsInstructions = {
  type: 'A';
  host: string;
  hostLabel: string;
  target: string;
};

@Injectable()
export class CustomDomainDnsService {
  constructor(private readonly configService: ConfigService) {}

  getInstructions(customDomain: string): CustomDomainDnsInstructions {
    const target =
      this.configService.get<string>('CUSTOM_DOMAIN_A_TARGET')?.trim() ?? '';
    if (isIP(target) !== 4) {
      throw new ServiceUnavailableException(
        'Custom-domain public IPv4 target is not configured',
      );
    }

    return {
      type: 'A',
      host: customDomain,
      hostLabel: '@',
      target,
    };
  }

  async verify(customDomain: string): Promise<CustomDomainDnsInstructions> {
    const instructions = this.getInstructions(customDomain);

    let records: string[];
    try {
      records = await resolve4(customDomain);
    } catch {
      throw new ConflictException(
        `DNS is not ready. Add A record ${instructions.hostLabel} pointing to ${instructions.target} and try again after propagation.`,
      );
    }

    const matches = records.some((record) => record === instructions.target);
    if (!matches) {
      throw new ConflictException(
        `DNS A record does not point to ${instructions.target}`,
      );
    }

    return instructions;
  }
}
