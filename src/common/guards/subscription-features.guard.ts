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

type SubscriptionFeatureUser = {
  role?: string;
  actorType?: string;
  tid?: string | null;
  rid?: string | null;
};

type SubscriptionFeatureRequest = {
  user?: SubscriptionFeatureUser;
  method?: string;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
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
      [
        this.readPath(Reflect.getMetadata(PATH_METADATA, context.getClass())),
        this.readPath(Reflect.getMetadata(PATH_METADATA, context.getHandler())),
      ]
        .filter(Boolean)
        .join('/'),
    );
    if (!feature || !user) return true;

    const scope = await this.resolveSubscriptionScope(request, user);
    if (!scope) return true;

    const subscription = await this.prisma.tenantSubscription.findFirst({
      where: {
        tenantId: scope.tenantId,
        OR: [{ restaurantId: scope.restaurantId }, { restaurantId: null }],
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

  private async resolveSubscriptionScope(
    request: SubscriptionFeatureRequest,
    user: SubscriptionFeatureUser,
  ): Promise<{ tenantId: string; restaurantId: string } | null> {
    const requestedRestaurantId = this.resolveRequestedRestaurantId(request);

    if (!requestedRestaurantId) {
      return user.tid && user.rid
        ? { tenantId: user.tid, restaurantId: user.rid }
        : null;
    }

    if (!user.tid) {
      throw new ForbiddenException(
        'Access to the selected restaurant is denied',
      );
    }

    if (user.actorType === 'STAFF' || user.role === 'STAFF') {
      if (user.rid !== requestedRestaurantId) {
        throw new ForbiddenException(
          'Access to the selected restaurant is denied',
        );
      }

      return { tenantId: user.tid, restaurantId: requestedRestaurantId };
    }

    if (user.rid && user.rid !== requestedRestaurantId) {
      throw new ForbiddenException(
        'Access to the selected restaurant is denied',
      );
    }

    if (!user.rid) {
      const restaurant = await this.prisma.restaurant.findFirst({
        where: {
          id: requestedRestaurantId,
          tenantId: user.tid,
          deletedAt: null,
          isActive: true,
        },
        select: { id: true },
      });
      if (!restaurant) {
        throw new ForbiddenException(
          'Access to the selected restaurant is denied',
        );
      }
    }

    return { tenantId: user.tid, restaurantId: requestedRestaurantId };
  }

  private resolveRequestedRestaurantId(
    request: SubscriptionFeatureRequest,
  ): string | undefined {
    const sources = {
      params: this.normalizeScopeId(request.params?.restaurantId),
      query: this.normalizeScopeId(request.query?.restaurantId),
      body: this.normalizeScopeId(request.body?.restaurantId),
    };
    const distinctIds = new Set(Object.values(sources).filter(Boolean));
    if (distinctIds.size > 1) {
      throw new ForbiddenException(
        'Access to the selected restaurant is denied',
      );
    }

    const method = request.method?.toUpperCase();
    if (method === 'GET' || method === 'HEAD') {
      return sources.query ?? sources.params ?? sources.body;
    }

    return sources.params ?? sources.body ?? sources.query;
  }

  private normalizeScopeId(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;

    const normalized = value.trim();
    return normalized || undefined;
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
