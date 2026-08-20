import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync, verify } from 'crypto';
import { QzSigningService } from './qz-signing.service';

describe('QzSigningService', () => {
  it('rejects certificate and signing requests when QZ signing is disabled', () => {
    const configService = {
      get: jest.fn().mockReturnValue('false'),
    } as unknown as ConfigService;
    const service = new QzSigningService(configService);

    expect(() => service.getCertificate()).toThrow(ServiceUnavailableException);
    expect(() => service.signChallenge('challenge')).toThrow(
      ServiceUnavailableException,
    );
  });

  it('returns the configured certificate and signs challenges with RSA-SHA512', () => {
    const configService = {
      get: jest.fn().mockReturnValue('true'),
    } as unknown as ConfigService;
    const service = new QzSigningService(configService);
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const configuredService = service as unknown as {
      certificate: string;
      privateKey: typeof privateKey;
    };
    configuredService.certificate = 'test-certificate';
    configuredService.privateKey = privateKey;

    const challenge = 'qz-tray-challenge';
    const signature = service.signChallenge(challenge);

    expect(service.getCertificate()).toBe('test-certificate');
    expect(
      verify(
        'RSA-SHA512',
        Buffer.from(challenge, 'utf8'),
        publicKey,
        Buffer.from(signature, 'base64'),
      ),
    ).toBe(true);
  });
});
