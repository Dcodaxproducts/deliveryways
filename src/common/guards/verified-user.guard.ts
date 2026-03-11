import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_UNVERIFIED_KEY, IS_PUBLIC_KEY } from '../decorators';
import { UsersService } from '../../modules/users/users.service';

@Injectable()
export class VerifiedUserGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const allowUnverified = this.reflector.getAllAndOverride<boolean>(
      ALLOW_UNVERIFIED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowUnverified) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { uid?: string } }>();
    const userId = request.user?.uid;

    if (!userId) {
      return true;
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      return true;
    }

    if (!user.isVerified) {
      throw new ForbiddenException(
        'Please verify your email before performing this operation',
      );
    }

    return true;
  }
}
