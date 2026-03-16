import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators';
import { RolesEnum } from '../enums';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RolesEnum[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { role?: string } }>();
    const userRole = request.user?.role;

    if (!userRole || !requiredRoles.includes(userRole as RolesEnum)) {
      const allowedRoles = requiredRoles.join(', ');
      throw new ForbiddenException(
        `Your role does not have access to this action. Allowed roles: ${allowedRoles}`,
      );
    }

    return true;
  }
}
