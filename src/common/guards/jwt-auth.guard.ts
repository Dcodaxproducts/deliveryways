import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { CurrentSessionValidator } from '../auth';
import {
  AuthUserContext,
  ALLOW_SOFT_DELETED_KEY,
  IS_PUBLIC_KEY,
} from '../decorators';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly currentSessionValidator: CurrentSessionValidator,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
      user?: AuthUserContext;
    }>();
    const hasBearerToken = /^Bearer\s+\S+$/i.test(
      request.headers?.authorization ?? '',
    );

    if (isPublic && !hasBearerToken) {
      return true;
    }

    const isAllowedForSoftDeleted = this.reflector.getAllAndOverride<boolean>(
      ALLOW_SOFT_DELETED_KEY,
      [context.getHandler(), context.getClass()],
    );

    const isAuthenticated = await super.canActivate(context);
    if (!isAuthenticated) {
      return false;
    }

    const user = request.user;

    if (!user?.uid) {
      return true;
    }

    await this.currentSessionValidator.assertCurrentSession(
      user,
      !!isAllowedForSoftDeleted,
    );

    return true;
  }
}
