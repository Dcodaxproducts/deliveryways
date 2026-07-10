import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRoleEnum } from '../enums';

export type AuthActorType = 'USER' | 'STAFF' | 'DELIVERYMAN';

export interface AuthUserContext {
  uid: string;
  role: UserRoleEnum | 'DELIVERYMAN';
  actorType?: AuthActorType;
  tid?: string;
  rid?: string;
  bid?: string;
  ownerUserId?: string;
  staffRoleId?: string;
  panelType?: string;
  restaurantAccess?: {
    restaurantIds?: string[];
    branchIds?: string[];
    allRestaurants?: boolean;
    hasAllRestaurantsAccess?: boolean;
  } | null;
  isGuest?: boolean;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUserContext => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUserContext }>();
    return request.user;
  },
);
