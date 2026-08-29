import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../database';

const FEATURE_BY_ROUTE: Array<[string, string]> = [
  ['customer-app/admin/table-reservations', 'tableBooking'],
  ['admin/reports', 'customerAnalytics'],
  ['group-orders', 'orderManagement'],
  ['orders', 'orderManagement'],
  ['pos', 'posCashRegister'],
  ['table-reservations', 'tableBooking'],
  ['deliverymen', 'selfDelivery'],
  ['chat', 'chat'],
];

const EXACT_FEATURE_BY_ROUTE = new Map<string, string>([
  ['admin/reports/orders', 'orderManagement'],
]);

type SubscriptionFeatureRequest = {
  user?: {
    role?: string;
    actorType?: string;
    tid?: string | null;
    rid?: string | null;
  };
};

export const resolveSubscriptionFeature = (path: string) => {
  const normalized = path.replace(/^\/+|\/+$/g, '');
  const exactFeature = EXACT_FEATURE_BY_ROUTE.get(normalized);
  if (exactFeature) return exactFeature;

  return FEATURE_BY_ROUTE.find(
    ([route]) => normalized === route || normalized.startsWith(`${route}/`),
  )?.[1];
};

@Injectable()
export class SubscriptionFeaturesGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<SubscriptionFeatureRequest>();
    const user = request.user;
    if (!this.isRestaurantPanelActor(user?.role, user?.actorType)) return true;

    const feature = resolveSubscriptionFeature(
      this.readPath(Reflect.getMetadata(PATH_METADATA, context.getClass())),
    );
    if (!feature || !user?.tid || !user.rid) return true;

    const subscription = await this.prisma.tenantSubscription.findFirst({
      where: {
        tenantId: user.tid,
        OR: [{ restaurantId: user.rid }, { restaurantId: null }],
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
      },
      orderBy: [{ restaurantId: 'desc' }, { createdAt: 'desc' }],
      select: { packagePlan: { select: { features: true } } },
    });
    const features = this.asObject(subscription?.packagePlan.features);

    if (features[feature] === false) {
      throw new ForbiddenException(
        `Your current subscription does not include ${feature}`,
      );
    }

    return true;
  }

  private isRestaurantPanelActor(role?: string, actorType?: string) {
    return (
      actorType === 'STAFF' ||
      ['BUSINESS_ADMIN', 'RESTAURANT_ADMIN', 'BRANCH_ADMIN', 'STAFF'].includes(
        role ?? '',
      )
    );
  }

  private readPath(value: unknown) {
    if (Array.isArray(value)) return String(value[0] ?? '');
    return typeof value === 'string' ? value : '';
  }

  private asObject(value: Prisma.JsonValue | null | undefined) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }
}
