import { Injectable } from '@nestjs/common';
import {
  LocalizationEntityType as PrismaLocalizationEntityType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database';
import { ListEntityTranslationsDto } from './dto';

@Injectable()
export class LocalizationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findRestaurantScope(restaurantId: string, tenantId?: string) {
    return this.prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true, tenantId: true },
    });
  }

  findEntityScope(
    entityType: PrismaLocalizationEntityType,
    entityId: string,
    restaurantId: string,
  ) {
    switch (entityType) {
      case 'RESTAURANT':
        return this.prisma.restaurant.findFirst({
          where: { id: entityId, deletedAt: null },
          select: { id: true, tenantId: true },
        });
      case 'BRANCH':
        return this.prisma.branch.findFirst({
          where: { id: entityId, restaurantId, deletedAt: null },
          select: { id: true, tenantId: true },
        });
      case 'RESTAURANT_MENU':
        return this.prisma.restaurantMenu.findFirst({
          where: { id: entityId, restaurantId, deletedAt: null },
          select: { id: true, restaurant: { select: { tenantId: true } } },
        });
      case 'MENU_CATEGORY':
        return this.prisma.menuCategory.findFirst({
          where: { id: entityId, restaurantId, deletedAt: null },
          select: { id: true, restaurant: { select: { tenantId: true } } },
        });
      case 'MENU_ITEM':
        return this.prisma.menuItem.findFirst({
          where: { id: entityId, restaurantId, deletedAt: null },
          select: { id: true, restaurant: { select: { tenantId: true } } },
        });
      case 'MENU_ITEM_VARIATION':
        return this.prisma.menuItemVariation.findFirst({
          where: { id: entityId, restaurantId, deletedAt: null },
          select: { id: true, restaurant: { select: { tenantId: true } } },
        });
      case 'MODIFIER_GROUP':
        return this.prisma.modifierGroup.findFirst({
          where: { id: entityId, restaurantId, deletedAt: null },
          select: { id: true, restaurant: { select: { tenantId: true } } },
        });
      case 'MODIFIER':
        return this.prisma.modifier.findFirst({
          where: { id: entityId, restaurantId, deletedAt: null },
          select: { id: true, restaurant: { select: { tenantId: true } } },
        });
      case 'COUPON':
        return this.prisma.coupon.findFirst({
          where: { id: entityId, restaurantId, deletedAt: null },
          select: { id: true, tenantId: true },
        });
    }
  }

  upsert(params: {
    tenantId: string;
    restaurantId: string;
    entityType: PrismaLocalizationEntityType;
    entityId: string;
    locale: string;
    fields: Prisma.InputJsonObject;
    isActive: boolean;
    userId: string;
  }) {
    return this.prisma.entityTranslation.upsert({
      where: {
        restaurantId_entityType_entityId_locale: {
          restaurantId: params.restaurantId,
          entityType: params.entityType,
          entityId: params.entityId,
          locale: params.locale,
        },
      },
      update: {
        fields: params.fields,
        isActive: params.isActive,
        updatedBy: params.userId,
      },
      create: {
        tenantId: params.tenantId,
        restaurantId: params.restaurantId,
        entityType: params.entityType,
        entityId: params.entityId,
        locale: params.locale,
        fields: params.fields,
        isActive: params.isActive,
        createdBy: params.userId,
        updatedBy: params.userId,
      },
    });
  }

  async list(
    restaurantId: string | undefined,
    query: ListEntityTranslationsDto,
  ) {
    const where: Prisma.EntityTranslationWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.locale ? { locale: query.locale } : {}),
      ...(query.includeInactive ? {} : { isActive: true }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.entityTranslation.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ updatedAt: 'desc' }],
      }),
      this.prisma.entityTranslation.count({ where }),
    ]);

    return { items, total };
  }

  deactivate(params: {
    restaurantId: string;
    entityType: PrismaLocalizationEntityType;
    entityId: string;
    locale: string;
    userId: string;
  }) {
    return this.prisma.entityTranslation.updateMany({
      where: {
        restaurantId: params.restaurantId,
        entityType: params.entityType,
        entityId: params.entityId,
        locale: params.locale,
      },
      data: {
        isActive: false,
        updatedBy: params.userId,
      },
    });
  }
}
