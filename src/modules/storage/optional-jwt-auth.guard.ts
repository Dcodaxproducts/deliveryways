import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext) {
    try {
      await super.canActivate(context);
    } catch {
      return true;
    }

    return true;
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser) {
    if (err) {
      return null;
    }

    return user ?? null;
  }
}
