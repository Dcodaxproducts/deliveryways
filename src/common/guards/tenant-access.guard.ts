import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class TenantAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: { role?: string; tid?: string; rid?: string; bid?: string };
      params?: Record<string, string>;
      query?: Record<string, string>;
      body?: Record<string, unknown>;
    }>();

    const user = request.user;

    if (!user || user.role === 'SUPER_ADMIN') {
      return true;
    }

    const bodyTenantId = request.body?.tenantId as string | undefined;
    const queryTenantId = request.query?.tenantId;

    if (bodyTenantId && user.tid && bodyTenantId !== user.tid) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    if (queryTenantId && user.tid && queryTenantId !== user.tid) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    return true;
  }
}
