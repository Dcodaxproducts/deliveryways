import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRoleEnum } from '../enums';

export interface AuthUserContext {
  uid: string;
  role: UserRoleEnum;
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
