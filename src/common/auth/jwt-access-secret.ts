import { ConfigService } from '@nestjs/config';

export function getRequiredJwtAccessSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_ACCESS_SECRET');
  if (!secret?.trim()) {
    throw new TypeError('JWT_ACCESS_SECRET is required');
  }
  return secret;
}
