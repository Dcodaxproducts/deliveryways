import { InternalServerErrorException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class PayoutCredentialsService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(
    restaurantId: string,
    provider: string,
    credentials: Record<string, string>,
  ) {
    const key = this.getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`${restaurantId}:${provider}`, 'utf8'));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(credentials), 'utf8'),
      cipher.final(),
    ]);

    return [
      'v1',
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join('.');
  }

  decrypt(
    restaurantId: string,
    provider: string,
    encryptedCredentials: string,
  ): Record<string, string> {
    const [version, ivValue, tagValue, payloadValue] =
      encryptedCredentials.split('.');

    if (version !== 'v1' || !ivValue || !tagValue || !payloadValue) {
      throw new InternalServerErrorException(
        'Stored payout credentials are invalid',
      );
    }

    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.getKey(),
        Buffer.from(ivValue, 'base64'),
      );
      decipher.setAAD(Buffer.from(`${restaurantId}:${provider}`, 'utf8'));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payloadValue, 'base64')),
        decipher.final(),
      ]);
      const value: unknown = JSON.parse(decrypted.toString('utf8'));

      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid decrypted payout credentials');
      }

      return Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
    } catch {
      throw new InternalServerErrorException(
        'Stored payout credentials could not be decrypted',
      );
    }
  }

  private getKey() {
    const configured = this.configService.get<string>(
      'PAYOUT_CREDENTIALS_ENCRYPTION_KEY',
    );

    if (!configured) {
      throw new InternalServerErrorException(
        'PAYOUT_CREDENTIALS_ENCRYPTION_KEY is not configured',
      );
    }

    const key = /^[a-f\d]{64}$/i.test(configured)
      ? Buffer.from(configured, 'hex')
      : Buffer.from(configured, 'base64');

    if (key.length !== 32) {
      throw new InternalServerErrorException(
        'PAYOUT_CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes',
      );
    }

    return key;
  }
}
