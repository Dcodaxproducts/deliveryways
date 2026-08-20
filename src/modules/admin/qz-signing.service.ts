import {
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KeyObject,
  X509Certificate,
  createPrivateKey,
  createPublicKey,
  createSign,
} from 'crypto';
import { readFileSync } from 'fs';

@Injectable()
export class QzSigningService implements OnModuleInit {
  private readonly enabled: boolean;
  private certificate: string | null = null;
  private privateKey: KeyObject | null = null;

  constructor(private readonly configService: ConfigService) {
    this.enabled =
      this.configService.get<string>('QZ_SIGNING_ENABLED', 'false') === 'true';
  }

  onModuleInit(): void {
    if (!this.enabled) {
      return;
    }

    const certificatePath = this.requireConfig('QZ_CERTIFICATE_PATH');
    const privateKeyPath = this.requireConfig('QZ_PRIVATE_KEY_PATH');

    try {
      const certificate = readFileSync(certificatePath, 'utf8').trim();
      const privateKey = createPrivateKey(readFileSync(privateKeyPath, 'utf8'));
      const parsedCertificate = new X509Certificate(certificate);
      const certificatePublicKey = Buffer.from(
        parsedCertificate.publicKey.export({ type: 'spki', format: 'der' }),
      );
      const privateKeyPublicKey = Buffer.from(
        createPublicKey(privateKey).export({ type: 'spki', format: 'der' }),
      );

      if (!certificatePublicKey.equals(privateKeyPublicKey)) {
        throw new ServiceUnavailableException(
          'QZ certificate and private key do not match',
        );
      }

      const now = Date.now();
      if (
        Date.parse(parsedCertificate.validFrom) > now ||
        Date.parse(parsedCertificate.validTo) <= now
      ) {
        throw new ServiceUnavailableException(
          'QZ certificate is not currently valid',
        );
      }

      this.certificate = certificate;
      this.privateKey = privateKey;
    } catch (error: unknown) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'QZ signing configuration could not be loaded',
      );
    }
  }

  getCertificate(): string {
    this.assertReady();
    return this.certificate as string;
  }

  signChallenge(challenge: string): string {
    this.assertReady();
    const signer = createSign('RSA-SHA512');
    signer.update(challenge, 'utf8');
    signer.end();

    return signer.sign(this.privateKey as KeyObject, 'base64');
  }

  private requireConfig(key: string): string {
    const value = this.configService.get<string>(key)?.trim();
    if (!value) {
      throw new ServiceUnavailableException(
        'QZ signing file paths are not configured',
      );
    }

    return value;
  }

  private assertReady(): void {
    if (!this.enabled || !this.certificate || !this.privateKey) {
      throw new ServiceUnavailableException('QZ signing is unavailable');
    }
  }
}
