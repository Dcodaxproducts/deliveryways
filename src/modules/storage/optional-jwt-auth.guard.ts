import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext) {
    try {
      await super.canActivate(context);
    } catch (error: unknown) {
      if (this.hasAuthorizationHeader(context)) {
        throw error;
      }
    }

    return true;
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    _info: unknown,
    context: ExecutionContext,
  ) {
    if (this.hasAuthorizationHeader(context) && (err || !user)) {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    return user ?? null;
  }

  private hasAuthorizationHeader(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const authorization = request.headers.authorization;
    return typeof authorization === 'string' && authorization.trim().length > 0;
  }
}
