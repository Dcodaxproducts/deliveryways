import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../database';

interface TenantContext {
  tenantId?: string;
  restaurantId?: string;
  tenantSlug?: string;
  restaurantSlug?: string;
}

@Injectable()
export class TenantDiscoveryMiddleware implements NestMiddleware {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async use(
    req: Request & { tenantContext?: TenantContext },
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const tenantIdHeader = req.header('x-tenant-id');
    const restaurantIdHeader = req.header('x-restaurant-id');
    const tenantSlugHeader = req.header('x-tenant-slug');
    const restaurantSlugHeader = req.header('x-restaurant-slug');

    const context: TenantContext = {
      tenantId: tenantIdHeader ?? undefined,
      restaurantId: restaurantIdHeader ?? undefined,
      tenantSlug: tenantSlugHeader ?? undefined,
      restaurantSlug: restaurantSlugHeader ?? undefined,
    };

    const host = req.hostname;
    const subdomain = host.split('.')[0];

    if (
      !context.restaurantSlug &&
      subdomain &&
      !['www', 'api', 'localhost'].includes(subdomain)
    ) {
      context.restaurantSlug = subdomain;
    }

    if (!context.restaurantId && context.restaurantSlug) {
      const restaurant = await this.prisma.restaurant.findFirst({
        where: {
          slug: context.restaurantSlug,
          deletedAt: null,
          isActive: true,
        },
        select: {
          id: true,
          tenantId: true,
        },
      });

      if (restaurant) {
        context.restaurantId = restaurant.id;
        context.tenantId = context.tenantId ?? restaurant.tenantId;
      }
    }

    if (!context.tenantId && context.tenantSlug) {
      const tenant = await this.prisma.tenant.findFirst({
        where: {
          slug: context.tenantSlug,
          deletedAt: null,
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      if (tenant) {
        context.tenantId = tenant.id;
      }
    }

    req.tenantContext = context;
    this.cls.set('TENANT_CONTEXT', context);

    next();
  }
}
