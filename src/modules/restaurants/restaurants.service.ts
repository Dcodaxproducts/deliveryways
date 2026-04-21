import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminListQueryDto, QueryDto } from '../../common/dto';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import {
  buildPaginationMeta,
  CustomerAppFaqItem,
  DEFAULT_CUSTOMER_APP_FAQ_CATEGORIES,
  extractCustomerAppFaqCategories,
  normalizeCustomerAppFaqItem,
} from '../../common/utils';
import { PrismaTx } from '../../common/types';
import { RestaurantsRepository } from './restaurants.repository';
import { TenantsService } from '../tenants/tenants.service';
import { StorageService } from '../storage/storage.service';
import {
  CreateRestaurantCustomerAppFaqDto,
  CreateRestaurantDto,
  UpdateRestaurantCustomerAppFaqDto,
  UpdateRestaurantCustomerAppContentDto,
  UpdateRestaurantDto,
  UpdateRestaurantImagesDto,
  UpdateRestaurantNotificationSettingsDto,
} from './dto';
import { randomUUID } from 'crypto';

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly restaurantsRepository: RestaurantsRepository,
    private readonly tenantsService: TenantsService,
    private readonly storageService: StorageService,
  ) {}

  async create(tenantId: string, dto: CreateRestaurantDto, tx?: PrismaTx) {
    const slug = await this.ensureUniqueSlug(dto.slug ?? dto.name);

    return this.restaurantsRepository.create(
      {
        tenant: { connect: { id: tenantId } },
        name: dto.name,
        slug,
        logoUrl: this.normalizeMediaUrl(dto.logoUrl),
        coverImage: this.normalizeMediaUrl(dto.coverImage),
        customDomain: dto.customDomain,
        tagline: dto.tagline,
        bio: dto.bio,
        supportContact: dto.supportContact as Prisma.InputJsonValue,
        branding: dto.branding as Prisma.InputJsonValue,
        socialMedia: dto.socialMedia as Prisma.InputJsonValue,
        settings: dto.settings as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  async createFromUser(
    user: AuthUserContext,
    dto: CreateRestaurantDto,
    tx?: PrismaTx,
  ) {
    const tenantId = await this.resolveCreateTenantId(user, dto.tenantId);
    const data = await this.create(tenantId, dto, tx);

    return {
      data: await this.resolveRestaurantMedia(data),
      message: 'Restaurant created successfully',
    };
  }

  async list(user: AuthUserContext, query: AdminListQueryDto) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN && !user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const allowedWithDeleted =
      user.role === UserRoleEnum.SUPER_ADMIN && !!query.withDeleted;
    const includeInactive =
      (user.role === UserRoleEnum.SUPER_ADMIN ||
        user.role === UserRoleEnum.BUSINESS_ADMIN) &&
      !!query.includeInactive;

    const tenantId =
      user.role === UserRoleEnum.SUPER_ADMIN
        ? undefined
        : user.role === UserRoleEnum.CUSTOMER && user.rid
          ? await this.resolveTenantByRestaurant(user.rid)
          : user.tid;

    const { items, total } = await this.restaurantsRepository.listByTenant(
      tenantId,
      query,
      false,
      allowedWithDeleted,
      includeInactive,
    );

    return {
      data: await Promise.all(
        items.map((item) => this.withDeletionState(item)),
      ),
      message: 'Restaurants fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async listPublic(tenantId: string, query: QueryDto) {
    const { items, total } = await this.restaurantsRepository.listByTenant(
      tenantId,
      query,
      true,
    );

    return {
      data: await Promise.all(
        items.map((item) => this.withDeletionState(item)),
      ),
      message: 'Public restaurants fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const restaurant = await this.restaurantsRepository.findById(id);

    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException('Restaurant not found');
    }

    await this.ensureRestaurantReadAccess(user, restaurant.id);

    return {
      data: await this.withDeletionState(restaurant),
      message: 'Restaurant fetched successfully',
    };
  }

  async update(
    user: AuthUserContext,
    id: string,
    dto: UpdateRestaurantDto,
    tx?: PrismaTx,
  ) {
    await this.ensureRestaurantWriteAccess(user, id);

    const data = await this.restaurantsRepository.update(
      id,
      {
        name: dto.name,
        slug: dto.slug ? await this.ensureUniqueSlug(dto.slug, id) : undefined,
        logoUrl:
          dto.logoUrl !== undefined
            ? this.normalizeMediaUrl(dto.logoUrl)
            : undefined,
        coverImage:
          dto.coverImage !== undefined
            ? this.normalizeMediaUrl(dto.coverImage)
            : undefined,
        customDomain: dto.customDomain,
        tagline: dto.tagline,
        bio: dto.bio,
        supportContact: dto.supportContact as Prisma.InputJsonValue,
        branding: dto.branding as Prisma.InputJsonValue,
        socialMedia: dto.socialMedia as Prisma.InputJsonValue,
        settings: dto.settings as Prisma.InputJsonValue,
      },
      tx,
    );

    return {
      data: await this.resolveRestaurantMedia(data),
      message: 'Restaurant updated successfully',
    };
  }

  async suspend(user: AuthUserContext, id: string, tx?: PrismaTx) {
    await this.ensureRestaurantWriteAccess(user, id);

    const data = await this.restaurantsRepository.setActive(id, false, tx);
    await this.restaurantsRepository.setBranchesActiveByRestaurant(
      id,
      false,
      tx,
    );

    return {
      data: await this.resolveRestaurantMedia(data),
      message: 'Restaurant suspended successfully',
    };
  }

  async activate(user: AuthUserContext, id: string, tx?: PrismaTx) {
    await this.ensureRestaurantWriteAccess(user, id);

    const data = await this.restaurantsRepository.setActive(id, true, tx);

    return {
      data: await this.resolveRestaurantMedia(data),
      message: 'Restaurant activated successfully',
    };
  }

  async customerAppContent(user: AuthUserContext, id: string) {
    const restaurant = await this.restaurantsRepository.findById(id);

    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException('Restaurant not found');
    }

    await this.ensureRestaurantReadAccess(user, id);

    return {
      data: await this.extractCustomerAppContent(restaurant),
      message: 'Restaurant customer app content fetched successfully',
    };
  }

  async customerAppContentFromContext(user: AuthUserContext) {
    if (!user.rid) {
      throw new ForbiddenException('Restaurant context is required');
    }

    const restaurant = await this.restaurantsRepository.findById(user.rid);

    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException('Restaurant not found');
    }

    return {
      data: await this.extractCustomerAppContent(restaurant),
      message: 'Restaurant customer app content fetched successfully',
    };
  }

  async updateCustomerAppContent(
    user: AuthUserContext,
    id: string,
    dto: UpdateRestaurantCustomerAppContentDto,
    tx?: PrismaTx,
  ) {
    await this.ensureRestaurantWriteAccess(user, id);

    const restaurant = await this.restaurantsRepository.findById(id);
    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException('Restaurant not found');
    }

    const nextSettings = this.mergeCustomerAppContent(restaurant.settings, dto);
    const data = await this.restaurantsRepository.update(
      id,
      {
        settings: nextSettings as Prisma.InputJsonValue,
        supportContact:
          dto.supportContact !== undefined
            ? (dto.supportContact as Prisma.InputJsonValue)
            : undefined,
      },
      tx,
    );

    return {
      data: await this.extractCustomerAppContent(data),
      message: 'Restaurant customer app content updated successfully',
    };
  }

  async customerAppFaqs(user: AuthUserContext, id: string) {
    const restaurant = await this.restaurantsRepository.findById(id);

    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException('Restaurant not found');
    }

    await this.ensureRestaurantReadAccess(user, restaurant.id);

    const items = this.extractCustomerAppFaqs(restaurant.settings);

    return {
      data: {
        restaurantId: restaurant.id,
        categories: extractCustomerAppFaqCategories(items),
        defaultCategories: [...DEFAULT_CUSTOMER_APP_FAQ_CATEGORIES],
        items,
      },
      message: 'Restaurant customer app FAQs fetched successfully',
    };
  }

  async createCustomerAppFaq(
    user: AuthUserContext,
    id: string,
    dto: CreateRestaurantCustomerAppFaqDto,
    tx?: PrismaTx,
  ) {
    await this.ensureRestaurantWriteAccess(user, id);

    const restaurant = await this.restaurantsRepository.findById(id);
    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException('Restaurant not found');
    }

    const now = new Date().toISOString();
    const nextItem: CustomerAppFaqItem = {
      id: randomUUID(),
      question: dto.question.trim(),
      answer: dto.answer.trim(),
      category: dto.category.trim(),
      status: dto.status ?? 'PUBLISHED',
      visibility: dto.visibility ?? 'PUBLIC',
      createdByUserId: user.uid ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await this.restaurantsRepository.update(
      id,
      {
        settings: this.writeCustomerAppFaqs(restaurant.settings, [
          ...this.extractCustomerAppFaqs(restaurant.settings),
          nextItem,
        ]) as Prisma.InputJsonValue,
      },
      tx,
    );

    return {
      data: nextItem,
      message: 'Restaurant customer app FAQ created successfully',
    };
  }

  async updateCustomerAppFaq(
    user: AuthUserContext,
    id: string,
    faqId: string,
    dto: UpdateRestaurantCustomerAppFaqDto,
    tx?: PrismaTx,
  ) {
    await this.ensureRestaurantWriteAccess(user, id);

    const restaurant = await this.restaurantsRepository.findById(id);
    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException('Restaurant not found');
    }

    const items = this.extractCustomerAppFaqs(restaurant.settings);
    const itemIndex = items.findIndex((item) => item.id === faqId);

    if (itemIndex === -1) {
      throw new NotFoundException('FAQ not found');
    }

    const currentItem = items[itemIndex];
    const nextItem: CustomerAppFaqItem = {
      ...currentItem,
      ...(dto.question !== undefined ? { question: dto.question.trim() } : {}),
      ...(dto.answer !== undefined ? { answer: dto.answer.trim() } : {}),
      ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.visibility !== undefined ? { visibility: dto.visibility } : {}),
      updatedAt: new Date().toISOString(),
    };

    items[itemIndex] = nextItem;

    await this.restaurantsRepository.update(
      id,
      {
        settings: this.writeCustomerAppFaqs(
          restaurant.settings,
          items,
        ) as Prisma.InputJsonValue,
      },
      tx,
    );

    return {
      data: nextItem,
      message: 'Restaurant customer app FAQ updated successfully',
    };
  }

  async removeCustomerAppFaq(
    user: AuthUserContext,
    id: string,
    faqId: string,
    tx?: PrismaTx,
  ) {
    await this.ensureRestaurantWriteAccess(user, id);

    const restaurant = await this.restaurantsRepository.findById(id);
    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException('Restaurant not found');
    }

    const items = this.extractCustomerAppFaqs(restaurant.settings);
    const nextItems = items.filter((item) => item.id !== faqId);

    if (nextItems.length === items.length) {
      throw new NotFoundException('FAQ not found');
    }

    await this.restaurantsRepository.update(
      id,
      {
        settings: this.writeCustomerAppFaqs(
          restaurant.settings,
          nextItems,
        ) as Prisma.InputJsonValue,
      },
      tx,
    );

    return {
      data: { id: faqId },
      message: 'Restaurant customer app FAQ removed successfully',
    };
  }

  async notificationSettings(user: AuthUserContext) {
    const restaurant = await this.getRestaurantForNotificationSettings(user);

    return {
      data: this.extractNotificationSettings(restaurant),
      message: 'Notification settings fetched successfully',
    };
  }

  async updateNotificationSettings(
    user: AuthUserContext,
    dto: UpdateRestaurantNotificationSettingsDto,
    tx?: PrismaTx,
  ) {
    const restaurant = await this.getRestaurantForNotificationSettings(user);
    const nextSettings = this.mergeNotificationSettings(
      restaurant.settings,
      dto,
    );
    this.validateNotificationSettings(nextSettings);

    const data = await this.restaurantsRepository.update(
      restaurant.id,
      {
        settings: nextSettings as Prisma.InputJsonValue,
      },
      tx,
    );

    return {
      data: this.extractNotificationSettings(data),
      message: 'Notification settings updated successfully',
    };
  }

  async updateImages(
    user: AuthUserContext,
    id: string,
    dto: UpdateRestaurantImagesDto,
    tx?: PrismaTx,
  ) {
    await this.ensureRestaurantWriteAccess(user, id);

    const data = await this.restaurantsRepository.update(
      id,
      {
        logoUrl:
          dto.logoUrl !== undefined
            ? this.normalizeMediaUrl(dto.logoUrl)
            : undefined,
        coverImage:
          dto.coverImage !== undefined
            ? this.normalizeMediaUrl(dto.coverImage)
            : undefined,
      },
      tx,
    );

    return {
      data: await this.resolveRestaurantMedia(data),
      message: 'Restaurant images updated successfully',
    };
  }

  async remove(user: AuthUserContext, id: string, tx?: PrismaTx) {
    await this.ensureRestaurantWriteAccess(user, id);

    const data = await this.restaurantsRepository.softDelete(id, tx);

    return {
      data,
      message: 'Restaurant and all related branches soft deleted',
    };
  }

  async forceDelete(user: AuthUserContext, id: string, tx?: PrismaTx) {
    if (
      user.role !== UserRoleEnum.SUPER_ADMIN &&
      user.role !== UserRoleEnum.BUSINESS_ADMIN
    ) {
      throw new ForbiddenException(
        'Only business admin or super admin can force delete restaurants',
      );
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN && user.rid !== id) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }

    const summary = await this.restaurantsRepository.getDeleteSummary(id);
    const blockers = Object.entries(summary)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({ resource: key, count }));

    if (blockers.length > 0) {
      throw new BadRequestException({
        message:
          'Restaurant cannot be force deleted while related records still exist',
        blockers,
      });
    }

    const data = await this.restaurantsRepository.forceDelete(id, tx);

    return {
      data,
      message: 'Restaurant force deleted successfully',
    };
  }

  private async withDeletionState<
    T extends {
      deletedAt?: Date | null;
      isActive?: boolean;
      logoUrl?: string | null;
      coverImage?: string | null;
    },
  >(entity: T) {
    return {
      ...(await this.resolveRestaurantMedia(entity)),
      deletionState: {
        isDeleted: !!entity.deletedAt,
        deletionScheduled: false,
        deletedAt: entity.deletedAt ?? null,
        deleteAfter: null,
        isActive: entity.isActive ?? true,
      },
    };
  }

  private async extractCustomerAppContent(restaurant: {
    id: string;
    name?: string;
    slug?: string | null;
    logoUrl?: string | null;
    coverImage?: string | null;
    tagline?: string | null;
    bio?: string | null;
    settings: Prisma.JsonValue | null;
    supportContact: Prisma.JsonValue | null;
  }) {
    return {
      restaurantId: restaurant.id,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name ?? null,
        slug: restaurant.slug ?? null,
        logoUrl: await this.resolveMediaUrl(restaurant.logoUrl),
        coverImage: await this.resolveMediaUrl(restaurant.coverImage),
        tagline: restaurant.tagline ?? null,
        bio: restaurant.bio ?? null,
      },
      privacyPolicy: this.readStringValue(restaurant.settings, [
        ['customerApp', 'privacyPolicy'],
        ['publicContent', 'privacyPolicy'],
        ['privacyPolicy'],
        ['privacy_policy'],
      ]),
      helpSupport: this.readStringValue(restaurant.settings, [
        ['customerApp', 'helpSupport'],
        ['publicContent', 'helpSupport'],
        ['helpSupport'],
        ['help_support'],
      ]),
      faqCategories: extractCustomerAppFaqCategories(
        this.extractCustomerAppFaqs(restaurant.settings),
      ),
      faqs: this.extractCustomerAppFaqs(restaurant.settings),
      supportContact: this.asObject(restaurant.supportContact),
      config: {
        currency: this.readRestaurantCurrency(restaurant.settings),
      },
    };
  }

  private readRestaurantCurrency(settings: Prisma.JsonValue | null) {
    return this.readStringValue(settings, [
      ['customerApp', 'currency'],
      ['checkout', 'currency'],
      ['payments', 'currency'],
      ['currency'],
      ['defaultCurrency'],
    ]);
  }

  private mergeCustomerAppContent(
    currentSettings: Prisma.JsonValue | null,
    dto: UpdateRestaurantCustomerAppContentDto,
  ): Prisma.JsonObject {
    const root = this.asObject(currentSettings);
    const customerApp = this.asObject(root.customerApp);
    const existingFaqs = this.extractCustomerAppFaqs(currentSettings);

    return {
      ...root,
      customerApp: {
        ...customerApp,
        ...(dto.privacyPolicy !== undefined
          ? { privacyPolicy: dto.privacyPolicy }
          : {}),
        ...(dto.helpSupport !== undefined
          ? { helpSupport: dto.helpSupport }
          : {}),
        ...(dto.faqs !== undefined
          ? {
              faqs: dto.faqs
                .map((item, index) => {
                  const existingItem =
                    item.id !== undefined
                      ? existingFaqs.find((faq) => faq.id === item.id)
                      : undefined;
                  const now = new Date().toISOString();

                  return normalizeCustomerAppFaqItem(
                    {
                      id: existingItem?.id ?? item.id ?? randomUUID(),
                      question: item.question,
                      answer: item.answer,
                      category:
                        item.category ?? existingItem?.category ?? undefined,
                      status: item.status ?? existingItem?.status ?? undefined,
                      visibility:
                        item.visibility ??
                        existingItem?.visibility ??
                        undefined,
                      createdByUserId:
                        existingItem?.createdByUserId ?? undefined,
                      createdAt: existingItem?.createdAt ?? now,
                      updatedAt: now,
                    },
                    `legacy:${index}`,
                  );
                })
                .filter((item): item is CustomerAppFaqItem => item !== null),
            }
          : {}),
      },
    } as unknown as Prisma.JsonObject;
  }

  private extractCustomerAppFaqs(
    source: Prisma.JsonValue | null,
  ): CustomerAppFaqItem[] {
    return this.readFaqs(source, [
      ['customerApp', 'faqs'],
      ['publicContent', 'faqs'],
      ['faqs'],
    ]);
  }

  private writeCustomerAppFaqs(
    currentSettings: Prisma.JsonValue | null,
    items: CustomerAppFaqItem[],
  ): Prisma.JsonObject {
    const root = this.asObject(currentSettings);
    const customerApp = this.asObject(root.customerApp);

    return {
      ...root,
      customerApp: {
        ...customerApp,
        faqs: items,
      },
    } as unknown as Prisma.JsonObject;
  }

  private extractNotificationSettings(restaurant: {
    settings: Prisma.JsonValue | null;
  }) {
    return {
      emailAddress: this.readStringValue(restaurant.settings, [
        ['notificationSettings', 'emailAddress'],
      ]),
      phoneNumber: this.readStringValue(restaurant.settings, [
        ['notificationSettings', 'phoneNumber'],
      ]),
      whatsappNumber: this.readStringValue(restaurant.settings, [
        ['notificationSettings', 'whatsappNumber'],
      ]),
      notificationTypes: this.extractNotificationTypeMatrix(
        restaurant.settings,
      ),
    };
  }

  private mergeNotificationSettings(
    currentSettings: Prisma.JsonValue | null,
    dto: UpdateRestaurantNotificationSettingsDto,
  ): Prisma.JsonObject {
    const root = this.asObject(currentSettings);
    const notificationSettings = this.asObject(root.notificationSettings);
    const notificationTypes = this.asObject(
      notificationSettings.notificationTypes,
    );

    return {
      ...root,
      notificationSettings: {
        ...notificationSettings,
        ...(dto.emailAddress !== undefined
          ? { emailAddress: dto.emailAddress }
          : {}),
        ...(dto.phoneNumber !== undefined
          ? { phoneNumber: dto.phoneNumber }
          : {}),
        ...(dto.whatsappNumber !== undefined
          ? { whatsappNumber: dto.whatsappNumber }
          : {}),
        ...(dto.notificationTypes !== undefined
          ? {
              notificationTypes: this.mergeNotificationTypeMatrix(
                notificationTypes,
                dto.notificationTypes as Record<string, unknown>,
              ),
            }
          : {}),
      },
    } as Prisma.JsonObject;
  }

  private validateNotificationSettings(settings: Prisma.JsonObject) {
    const current = this.extractNotificationSettings({
      settings,
    });

    if (
      this.isChannelUsed(current.notificationTypes, 'email') &&
      !current.emailAddress
    ) {
      throw new BadRequestException(
        'emailAddress is required when email notifications are selected',
      );
    }

    if (
      this.isChannelUsed(current.notificationTypes, 'sms') &&
      !current.phoneNumber
    ) {
      throw new BadRequestException(
        'phoneNumber is required when SMS notifications are selected',
      );
    }

    if (
      this.isChannelUsed(current.notificationTypes, 'whatsapp') &&
      !current.whatsappNumber
    ) {
      throw new BadRequestException(
        'whatsappNumber is required when WhatsApp notifications are selected',
      );
    }
  }

  private extractNotificationTypeMatrix(source: unknown) {
    const paths = [
      'newOrder',
      'orderCancelled',
      'printerError',
      'dailyReport',
      'payoutUpdate',
    ] as const;

    const result = Object.fromEntries(
      paths.map((key) => [
        key,
        {
          email: this.readBooleanValue(source, [
            ['notificationSettings', 'notificationTypes', key, 'email'],
          ]),
          sms: this.readBooleanValue(source, [
            ['notificationSettings', 'notificationTypes', key, 'sms'],
          ]),
          whatsapp: this.readBooleanValue(source, [
            ['notificationSettings', 'notificationTypes', key, 'whatsapp'],
          ]),
        },
      ]),
    );

    return result as Record<
      | 'newOrder'
      | 'orderCancelled'
      | 'printerError'
      | 'dailyReport'
      | 'payoutUpdate',
      { email: boolean; sms: boolean; whatsapp: boolean }
    >;
  }

  private mergeNotificationTypeMatrix(
    current: Record<string, unknown>,
    updates: Record<string, unknown>,
  ): Prisma.JsonObject {
    const keys = [
      'newOrder',
      'orderCancelled',
      'printerError',
      'dailyReport',
      'payoutUpdate',
    ] as const;

    return Object.fromEntries(
      keys.map((key) => {
        const existingRow = this.asObject(current[key]);
        const updateRow = this.asObject(updates[key]);

        return [
          key,
          {
            email:
              typeof updateRow.email === 'boolean'
                ? updateRow.email
                : typeof existingRow.email === 'boolean'
                  ? existingRow.email
                  : false,
            sms:
              typeof updateRow.sms === 'boolean'
                ? updateRow.sms
                : typeof existingRow.sms === 'boolean'
                  ? existingRow.sms
                  : false,
            whatsapp:
              typeof updateRow.whatsapp === 'boolean'
                ? updateRow.whatsapp
                : typeof existingRow.whatsapp === 'boolean'
                  ? existingRow.whatsapp
                  : false,
          },
        ];
      }),
    ) as Prisma.JsonObject;
  }

  private isChannelUsed(
    matrix: Record<string, { email: boolean; sms: boolean; whatsapp: boolean }>,
    channel: 'email' | 'sms' | 'whatsapp',
  ) {
    return Object.values(matrix).some((row) => row[channel]);
  }

  private async resolveMediaUrl(value: string | null | undefined) {
    return this.storageService.resolveViewUrl(this.normalizeMediaUrl(value));
  }

  private async resolveRestaurantMedia<
    T extends {
      logoUrl?: string | null;
      coverImage?: string | null;
    },
  >(restaurant: T) {
    return {
      ...restaurant,
      logoUrl: await this.resolveMediaUrl(restaurant.logoUrl ?? null),
      coverImage: await this.resolveMediaUrl(restaurant.coverImage ?? null),
    };
  }

  private normalizeMediaUrl(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const invalidPlaceholders = new Set([
      '[object Object]',
      'undefined',
      'null',
    ]);

    if (invalidPlaceholders.has(normalized)) {
      return null;
    }

    return normalized;
  }

  private readStringValue(source: unknown, paths: string[][]): string | null {
    for (const path of paths) {
      const value = this.readPath(source, path);
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  private readBooleanValue(source: unknown, paths: string[][]): boolean {
    for (const path of paths) {
      const value = this.readPath(source, path);
      if (typeof value === 'boolean') {
        return value;
      }
    }

    return false;
  }

  private readFaqs(source: unknown, paths: string[][]): CustomerAppFaqItem[] {
    for (const path of paths) {
      const value = this.readPath(source, path);
      if (!Array.isArray(value)) {
        continue;
      }

      const items = value
        .map((item, index) =>
          normalizeCustomerAppFaqItem(item, `legacy:${index}`),
        )
        .filter((item): item is CustomerAppFaqItem => item !== null);

      return items;
    }

    return [];
  }

  private readPath(source: unknown, path: string[]) {
    let current = source;

    for (const segment of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }

      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private async getRestaurantForNotificationSettings(user: AuthUserContext) {
    if (
      user.role !== UserRoleEnum.BUSINESS_ADMIN &&
      user.role !== UserRoleEnum.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only business admin or super admin can manage notification settings',
      );
    }

    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const restaurant = await this.restaurantsRepository.findFirstByTenantId(
      user.tid,
    );

    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException('Restaurant not found');
    }

    return restaurant;
  }

  private async resolveTenantByRestaurant(
    restaurantId: string,
  ): Promise<string> {
    const tenantId =
      await this.restaurantsRepository.findTenantIdByRestaurant(restaurantId);

    if (!tenantId) {
      throw new ForbiddenException('Restaurant context is invalid');
    }

    return tenantId;
  }

  private async resolveCreateTenantId(
    user: AuthUserContext,
    requestedTenantId?: string,
  ): Promise<string> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (!requestedTenantId) {
        throw new BadRequestException('tenantId is required for super admin');
      }

      const tenant = await this.tenantsService.findById(requestedTenantId);
      if (!tenant || tenant.deletedAt) {
        throw new NotFoundException('Tenant not found');
      }

      return requestedTenantId;
    }

    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    return user.tid;
  }

  private async ensureRestaurantReadAccess(
    user: AuthUserContext,
    restaurantId: string,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    if (user.role !== UserRoleEnum.BUSINESS_ADMIN) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }

    if (user.rid === restaurantId) {
      return;
    }

    const restaurant = await this.restaurantsRepository.findById(restaurantId);

    if (!restaurant || restaurant.deletedAt || restaurant.tenantId !== user.tid) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }
  }

  private async ensureRestaurantWriteAccess(
    user: AuthUserContext,
    restaurantId: string,
  ) {
    await this.ensureRestaurantReadAccess(user, restaurantId);
  }

  private async ensureUniqueSlug(
    base: string,
    ignoreId?: string,
  ): Promise<string> {
    const normalizedBase = base
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    let candidate = normalizedBase;
    let counter = 1;

    while (true) {
      const existing = await this.restaurantsRepository.findBySlug(candidate);
      if (!existing || existing.id === ignoreId) {
        return candidate;
      }
      candidate = `${normalizedBase}-${counter}`;
      counter += 1;
    }
  }
}
