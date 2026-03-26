import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRoleEnum } from '../enums';

export type AuthActorType = 'USER' | 'STAFF';

export interface AuthUserContext {
  uid: string;
  role: UserRoleEnum;
  actorType?: AuthActorType;
  tid?: string;
  rid?: string;
  bid?: string;
  ownerUserId?: string;
  staffRoleId?: string;
  panelType?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUserContext => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUserContext }>();
    return request.user;
  },
);
