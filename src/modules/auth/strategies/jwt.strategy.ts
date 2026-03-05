import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  uid: string;
  role: string;
  tid?: string;
  rid?: string;
  bid?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET', 'change-me'),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    if (!payload?.uid || !payload?.role) {
      throw new UnauthorizedException('Invalid token payload');
    }

    return payload;
  }
}
