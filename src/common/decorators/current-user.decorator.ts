import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUserContext {
  uid: string;
  role: string;
  tid?: string;
  rid?: string;
  bid?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUserContext => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUserContext }>();
    return request.user;
  },
);
