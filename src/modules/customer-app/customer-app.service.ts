import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import {
  buildPaginationMeta,
  CustomerAppFaqItem,
  extractCustomerAppFaqCategories,
  normalizeCustomerAppFaqItem,
} from '../../common/utils';
import {
  CreateTableReservationDto,
  HomeScreenQueryDto,
  ListAdminTableReservationsQueryDto,
  ListCuisineItemsQueryDto,
  ListCuisinesQueryDto,
  ListCustomerFavoritesQueryDto,
  ListPromotionalItemsQueryDto,
  ListTableReservationsQueryDto,
  PublicMenuItemBySlugQueryDto,
  PublicRestaurantQueryDto,
  CreateWalletTopUpDto,
  ListWalletHistoryQueryDto,
  RedeemLoyaltyPointsDto,
  ToggleFavoriteDto,
} from './dto';
import { CustomerAppRepository } from './customer-app.repository';
import { LoyaltyWalletService } from '../loyalty-wallet/loyalty-wallet.service';
import { StorageService } from '../storage/storage.service';
import { PaymentsService } from '../payments/payments.service';

interface FavoriteMetadataShape {
  customerApp?: {
    favoriteMenuItemIds?: string[];
    loyaltyPoints?: number;
    loyaltyRedeemedPoints?: number;
    wallet?: {
      balance?: number;
      currency?: string;
    };
    tableReservations?: TableReservationRecord[];
    loyaltyRedemptions?: LoyaltyRedemptionRecord[];
  };
}

export interface TableReservationRecord {
  id: string;
  branchId: string;
  reservationDate: string;
  guestCount: number;
  note: string | null;
  status: 'REQUESTED' | 'CANCELLED';
  createdAt: string;
  cancelledAt: string | null;
}

export interface TableReservationResponse extends TableReservationRecord {
  branch: {
    id: string;
    name: string;
    logoUrl: string | null;
    coverImage: string | null;
    description: string | null;
  } | null;
}

export interface AdminTableReservationResponse extends TableReservationResponse {
  customer: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    avatarUrl: string | null;
  };
}

export interface LoyaltyRedemptionRecord {
  id: string;
  points: number;
  note: string | null;
  createdAt: string;
}

@Injectable()
export class CustomerAppService {
  constructor(
    private readonly customerAppRepository: CustomerAppRepository,
    private readonly storageService: StorageService,
    private readonly loyaltyWalletService?: LoyaltyWalletService,
    private readonly paymentsService?: PaymentsService,
  ) {}

  async listFavorites(
    user: AuthUserContext,
    query: ListCustomerFavoritesQueryDto,
    requestedCustomerId?: string,
  ) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);
    const favoriteMenuItemIds = this.readFavoriteMenuItemIds(
      customer.profile?.metadata,
    );

    if (!favoriteMenuItemIds.length || !customer.restaurantId) {
      return {
        data: [],
        message: 'Favorite items fetched successfully',
        meta: buildPaginationMeta(query, 0),
      };
    }

    const { items, total } =
      await this.customerAppRepository.findFavoriteMenuItems(
        customer.restaurantId,
        customer.branchId ?? undefined,
        favoriteMenuItemIds,
        query,
      );

    return {
      data: await Promise.all(items.map((item) => this.mapMenuItem(item))),
      message: 'Favorite items fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async addFavorite(
    user: AuthUserContext,
    dto: ToggleFavoriteDto,
    requestedCustomerId?: string,
  ) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);
    const favoriteMenuItemIds = this.readFavoriteMenuItemIds(
      customer.profile?.metadata,
    );

    if (favoriteMenuItemIds.includes(dto.menuItemId)) {
      return {
        data: { favoriteMenuItemIds },
        message: 'Item already added to favorites',
      };
    }

    const updatedIds = [...favoriteMenuItemIds, dto.menuItemId];
    await this.customerAppRepository.upsertCustomerProfile(
      customer.id,
      this.writeFavoriteMenuItemIds(customer.profile?.metadata, updatedIds),
    );

    return {
      data: { favoriteMenuItemIds: updatedIds },
      message: 'Item added to favorites successfully',
    };
  }

  async removeFavorite(
    user: AuthUserContext,
    menuItemId: string,
    requestedCustomerId?: string,
  ) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);
    const favoriteMenuItemIds = this.readFavoriteMenuItemIds(
      customer.profile?.metadata,
    );
    const updatedIds = favoriteMenuItemIds.filter((id) => id !== menuItemId);

    await this.customerAppRepository.upsertCustomerProfile(
      customer.id,
      this.writeFavoriteMenuItemIds(customer.profile?.metadata, updatedIds),
    );

    return {
      data: { favoriteMenuItemIds: updatedIds },
      message: 'Item removed from favorites successfully',
    };
  }

  async getPrivacyPolicy(
    query: PublicRestaurantQueryDto,
    user?: AuthUserContext,
  ) {
    const { restaurant } = await this.getPublicContent(query, user);
    const privacyPolicy = this.readStringValue(restaurant.settings, [
      ['customerApp', 'privacyPolicy'],
      ['publicContent', 'privacyPolicy'],
      ['privacyPolicy'],
      ['privacy_policy'],
    ]);

    return {
      data: {
        restaurantId: restaurant.id,
        restaurantCoverImage: await this.resolveMediaUrl(restaurant.coverImage),
        title: 'Privacy Policy',
        content: privacyPolicy,
      },
      message: 'Privacy policy fetched successfully',
    };
  }

  async getHelpSupport(
    query: PublicRestaurantQueryDto,
    user?: AuthUserContext,
  ) {
    const { restaurant, branch } = await this.getPublicContent(query, user);
    const branchSettings = branch?.settings;

    return {
      data: {
        restaurantId: restaurant.id,
        restaurantCoverImage: await this.resolveMediaUrl(restaurant.coverImage),
        branchId: branch?.id ?? null,
        title: 'Help & Support',
        content:
          this.readStringValue(branchSettings, [
            ['customerApp', 'helpSupport'],
            ['publicContent', 'helpSupport'],
            ['helpSupport'],
            ['help_support'],
          ]) ??
          this.readStringValue(restaurant.settings, [
            ['customerApp', 'helpSupport'],
            ['publicContent', 'helpSupport'],
            ['helpSupport'],
            ['help_support'],
          ]),
        contacts: {
          phone:
            this.readStringValue(branchSettings, [['contact', 'phone']]) ??
            this.readStringValue(restaurant.supportContact, [['phone']]),
          whatsapp:
            this.readStringValue(branchSettings, [['contact', 'whatsapp']]) ??
            this.readStringValue(restaurant.supportContact, [['whatsapp']]),
          email: this.readStringValue(restaurant.supportContact, [['email']]),
        },
      },
      message: 'Help and support fetched successfully',
    };
  }

  async getFaqs(query: PublicRestaurantQueryDto, user?: AuthUserContext) {
    const { restaurant, branch } = await this.getPublicContent(query, user);
    const faqs =
      this.readFaqs(branch?.settings, [
        ['customerApp', 'faqs'],
        ['publicContent', 'faqs'],
        ['faqs'],
      ]) ??
      this.readFaqs(restaurant.settings, [
        ['customerApp', 'faqs'],
        ['publicContent', 'faqs'],
        ['faqs'],
      ]) ??
      [];
    const visibleFaqs = faqs.filter((item) => {
      if (item.status !== 'PUBLISHED') {
        return false;
      }

      if (item.visibility === 'AUTHENTICATED' && !user) {
        return false;
      }

      if (query.category?.trim()) {
        return item.category === query.category.trim();
      }

      return true;
    });

    return {
      data: {
        restaurantId: restaurant.id,
        restaurantCoverImage: await this.resolveMediaUrl(restaurant.coverImage),
        branchId: branch?.id ?? null,
        categories: extractCustomerAppFaqCategories(visibleFaqs),
        items: visibleFaqs,
      },
      message: 'FAQs fetched successfully',
    };
  }

  async listCuisines(query: ListCuisinesQueryDto, user?: AuthUserContext) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    await this.getPublicContent(resolvedQuery, user);
    const { items, total } =
      await this.customerAppRepository.listCuisineCategories(resolvedQuery);

    return {
      data: await Promise.all(
        items.map(async (item) => ({
          id: item.id,
          name: item.name,
          slug: item.slug,
          description: item.description,
          imageUrl: await this.resolveMediaUrl(item.imageUrl),
          sortOrder: item.sortOrder,
          itemCount: item._count.items,
        })),
      ),
      message: 'Cuisines fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async listCuisineItems(
    cuisineId: string,
    query: ListCuisineItemsQueryDto,
    user?: AuthUserContext,
  ) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    await this.getPublicContent(resolvedQuery, user);
    const cuisine = await this.customerAppRepository.findPublicCuisine(
      cuisineId,
      resolvedQuery.restaurantId,
      resolvedQuery.branchId,
    );

    if (!cuisine) {
      throw new NotFoundException('Cuisine not found');
    }

    const { items, total } =
      await this.customerAppRepository.listCuisineMenuItems(
        cuisineId,
        resolvedQuery,
      );

    return {
      data: {
        cuisine: await this.resolveCuisineMedia(cuisine),
        items: await Promise.all(items.map((item) => this.mapMenuItem(item))),
      },
      message: 'Cuisine items fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async listPromotionalItems(
    query: ListPromotionalItemsQueryDto,
    user?: AuthUserContext,
  ) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    await this.getPublicContent(resolvedQuery, user);
    const items =
      await this.customerAppRepository.listPromotionalItems(resolvedQuery);

    return {
      data: await Promise.all(items.map((item) => this.mapMenuItem(item))),
      message: 'Promotional items fetched successfully',
    };
  }

  async getItemBySlug(
    slug: string,
    query: PublicMenuItemBySlugQueryDto,
    user?: AuthUserContext,
  ) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    const item = await this.customerAppRepository.findPublicMenuItemBySlug(
      slug,
      resolvedQuery,
    );

    if (!item) {
      throw new NotFoundException('Menu item not found');
    }

    return {
      data: await this.mapMenuItem(item),
      message: 'Menu item fetched successfully',
    };
  }

  async getHomeScreen(query: HomeScreenQueryDto, user?: AuthUserContext) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    const { restaurant, branch } = await this.getPublicContent(
      resolvedQuery,
      user,
    );
    const [cuisines, promotionalItems, faqs] = await Promise.all([
      this.customerAppRepository.listCuisineCategories({
        ...resolvedQuery,
        page: 1,
        limit: query.cuisineLimit,
        sortBy: 'sortOrder',
        sortOrder: 'ASC',
      }),
      this.customerAppRepository.listPromotionalItems(resolvedQuery),
      this.getFaqs(resolvedQuery, user),
    ]);

    return {
      data: {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          logoUrl: await this.resolveMediaUrl(restaurant.logoUrl),
          coverImage: await this.resolveMediaUrl(restaurant.coverImage),
          tagline: restaurant.tagline,
          bio: restaurant.bio,
        },
        config: {
          currency: this.readRestaurantCurrency(restaurant.settings),
        },
        branch: branch
          ? {
              id: branch.id,
              name: branch.name,
              logoUrl: await this.resolveMediaUrl(branch.logoUrl ?? null),
              coverImage: await this.resolveMediaUrl(branch.coverImage),
              description: branch.description,
              tableReservationsEnabled: this.readBooleanValue(branch.settings, [
                ['tableReservationsEnabled'],
              ]),
            }
          : null,
        cuisines: await Promise.all(
          cuisines.items.map(async (item) => ({
            id: item.id,
            name: item.name,
            slug: item.slug,
            imageUrl: await this.resolveMediaUrl(item.imageUrl),
            itemCount: item._count.items,
          })),
        ),
        promotionalItems: await Promise.all(
          promotionalItems.map((item) => this.mapMenuItem(item)),
        ),
        faqs: faqs.data.items,
      },
      message: 'Home screen fetched successfully',
    };
  }

  async getLoyaltyPoints(user: AuthUserContext, requestedCustomerId?: string) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);
    const data = await this.loyaltyWalletService!.getLoyaltySummary({
      customerId: customer.id,
      tenantId: customer.tenantId!,
      restaurantId: customer.restaurantId!,
      branchId: customer.branchId ?? undefined,
    });

    return {
      data,
      message: 'Loyalty points fetched successfully',
    };
  }

  async redeemLoyaltyPoints(
    user: AuthUserContext,
    dto: RedeemLoyaltyPointsDto,
    requestedCustomerId?: string,
  ) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);
    const data = await this.loyaltyWalletService!.redeemPointsToWallet(
      {
        customerId: customer.id,
        tenantId: customer.tenantId!,
        restaurantId: customer.restaurantId!,
        branchId: customer.branchId ?? undefined,
      },
      dto.points,
      dto.note,
      user.uid,
    );

    return {
      data,
      message: 'Loyalty points redeemed successfully',
    };
  }

  async getWallet(user: AuthUserContext, requestedCustomerId?: string) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);
    const data = await this.loyaltyWalletService!.getWalletSummary({
      customerId: customer.id,
      tenantId: customer.tenantId!,
      restaurantId: customer.restaurantId!,
      branchId: customer.branchId ?? undefined,
    });

    return {
      data,
      message: 'Wallet fetched successfully',
    };
  }

  async getWalletHistory(
    user: AuthUserContext,
    query: ListWalletHistoryQueryDto,
    requestedCustomerId?: string,
  ) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);
    const result = await this.loyaltyWalletService!.listWalletHistory(
      {
        customerId: customer.id,
        tenantId: customer.tenantId!,
        restaurantId: customer.restaurantId!,
        branchId: customer.branchId ?? undefined,
      },
      query,
    );

    return {
      data: result.items,
      message: 'Wallet history fetched successfully',
      meta: buildPaginationMeta(query, result.total),
    };
  }

  async createWalletTopUp(
    user: AuthUserContext,
    dto: CreateWalletTopUpDto,
    requestedCustomerId?: string,
  ) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);
    const data = await this.paymentsService!.createWalletTopUpAttempt(
      user,
      {
        customerId: customer.id,
        tenantId: customer.tenantId!,
        restaurantId: customer.restaurantId!,
        branchId: customer.branchId ?? undefined,
      },
      dto,
    );

    return {
      data,
      message: 'Wallet top-up payment intent created successfully',
    };
  }

  async listAdminTableReservations(
    user: AuthUserContext,
    query: ListAdminTableReservationsQueryDto,
  ) {
    if (user.role === UserRoleEnum.CUSTOMER) {
      throw new ForbiddenException(
        'Customers cannot access reservation admin data',
      );
    }

    const restaurantId = await this.resolveAdminReservationRestaurantId(
      user,
      query.restaurantId,
    );
    const branchId = this.resolveAdminReservationBranchId(user, query.branchId);
    const customers =
      await this.customerAppRepository.findCustomersForTableReservations({
        restaurantId,
        customerId: query.customerId,
        search: query.search,
      });
    const reservations = customers.flatMap((customer) =>
      this.readTableReservations(customer.profile?.metadata)
        .filter((reservation) =>
          branchId ? reservation.branchId === branchId : true,
        )
        .filter((reservation) =>
          query.status ? reservation.status === query.status : true,
        )
        .map((reservation) => ({
          ...reservation,
          customer: {
            id: customer.id,
            email: customer.email,
            firstName: customer.profile?.firstName ?? null,
            lastName: customer.profile?.lastName ?? null,
            phone: customer.profile?.phone ?? null,
            avatarUrl: customer.profile?.avatarUrl ?? null,
          },
        })),
    );
    const branchIds = [...new Set(reservations.map((item) => item.branchId))];
    const branches = await this.customerAppRepository.findBranchesPublicContent(
      branchIds,
      restaurantId,
    );
    const branchMap = new Map(branches.map((branch) => [branch.id, branch]));
    const sortedReservations = this.sortAdminTableReservations(
      reservations,
      query.sortBy,
      query.sortOrder,
    );
    const start = (query.page - 1) * query.limit;
    const data = await Promise.all(
      sortedReservations
        .slice(start, start + query.limit)
        .map(async (reservation) => ({
          ...reservation,
          branch: await this.resolveBranchMedia(
            branchMap.get(reservation.branchId) ?? null,
          ),
        })),
    );

    return {
      data,
      message: 'Table reservations fetched successfully',
      meta: buildPaginationMeta(query, sortedReservations.length),
    };
  }

  async listTableReservations(
    user: AuthUserContext,
    query: ListTableReservationsQueryDto,
    requestedCustomerId?: string,
  ) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);
    const reservations = this.readTableReservations(customer.profile?.metadata);
    const branchIds = [...new Set(reservations.map((item) => item.branchId))];
    const branches = customer.restaurantId
      ? await this.customerAppRepository.findBranchesPublicContent(
          branchIds,
          customer.restaurantId,
        )
      : [];
    const branchMap = new Map(branches.map((branch) => [branch.id, branch]));
    const start = (query.page - 1) * query.limit;
    const data = await Promise.all(
      reservations
        .slice(start, start + query.limit)
        .map(async (reservation) => ({
          ...reservation,
          branch: await this.resolveBranchMedia(
            branchMap.get(reservation.branchId) ?? null,
          ),
        })),
    );

    return {
      data,
      message: 'Table reservations fetched successfully',
      meta: buildPaginationMeta(query, reservations.length),
    };
  }

  async createTableReservation(
    user: AuthUserContext,
    dto: CreateTableReservationDto,
    requestedCustomerId?: string,
  ) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);

    if (!customer.restaurantId) {
      throw new BadRequestException('Customer restaurant context is required');
    }

    const branch = await this.customerAppRepository.findBranchPublicContent(
      dto.branchId,
      customer.restaurantId,
    );

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const tableReservationsEnabled = this.readBooleanValue(branch.settings, [
      ['tableReservationsEnabled'],
    ]);

    if (!tableReservationsEnabled) {
      throw new BadRequestException(
        'Table reservations are not enabled for this branch',
      );
    }

    const reservationDate = new Date(dto.reservationDate);
    if (Number.isNaN(reservationDate.getTime())) {
      throw new BadRequestException('Invalid reservation date');
    }

    if (reservationDate.getTime() <= Date.now()) {
      throw new BadRequestException('Reservation date must be in the future');
    }

    const existingReservations = this.readTableReservations(
      customer.profile?.metadata,
    );
    const reservation: TableReservationRecord = {
      id: randomUUID(),
      branchId: dto.branchId,
      reservationDate: reservationDate.toISOString(),
      guestCount: dto.guestCount,
      note: dto.note?.trim() || null,
      status: 'REQUESTED',
      createdAt: new Date().toISOString(),
      cancelledAt: null,
    };

    const reservations = [reservation, ...existingReservations].slice(0, 20);
    const nextMetadata = this.writeCustomerAppMetadata(
      customer.profile?.metadata,
      {
        tableReservations: reservations,
      },
    );

    await this.customerAppRepository.upsertCustomerProfile(
      customer.id,
      nextMetadata,
    );

    return {
      data: reservation,
      message: 'Table reservation created successfully',
    };
  }

  async cancelTableReservation(
    user: AuthUserContext,
    reservationId: string,
    requestedCustomerId?: string,
  ) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);
    const existingReservations = this.readTableReservations(
      customer.profile?.metadata,
    );

    const reservation = existingReservations.find(
      (item) => item.id === reservationId,
    );

    if (!reservation) {
      throw new NotFoundException('Table reservation not found');
    }

    if (reservation.status === 'CANCELLED') {
      throw new BadRequestException('Table reservation is already cancelled');
    }

    const cancelledAt = new Date().toISOString();
    const reservations = existingReservations.map((item) =>
      item.id === reservationId
        ? {
            ...item,
            status: 'CANCELLED' as const,
            cancelledAt,
          }
        : item,
    );

    const nextMetadata = this.writeCustomerAppMetadata(
      customer.profile?.metadata,
      {
        tableReservations: reservations,
      },
    );

    await this.customerAppRepository.upsertCustomerProfile(
      customer.id,
      nextMetadata,
    );

    return {
      data: reservations.find((item) => item.id === reservationId) ?? null,
      message: 'Table reservation cancelled successfully',
    };
  }

  private async getPublicContent(
    query: PublicRestaurantQueryDto,
    user?: AuthUserContext,
  ) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    const restaurant =
      await this.customerAppRepository.findRestaurantPublicContent(
        resolvedQuery.restaurantId,
      );

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const branch = resolvedQuery.branchId
      ? await this.customerAppRepository.findBranchPublicContent(
          resolvedQuery.branchId,
          restaurant.id,
        )
      : null;

    if (resolvedQuery.branchId && !branch) {
      throw new NotFoundException('Branch not found');
    }

    return {
      restaurant: {
        ...restaurant,
        logoUrl: await this.resolveMediaUrl(restaurant.logoUrl),
        coverImage: await this.resolveMediaUrl(restaurant.coverImage),
      },
      branch: branch
        ? {
            ...branch,
            logoUrl: await this.resolveMediaUrl(branch.logoUrl),
            coverImage: await this.resolveMediaUrl(branch.coverImage),
          }
        : null,
    };
  }

  private resolvePublicRestaurantQuery<T extends PublicRestaurantQueryDto>(
    query: T,
    user?: AuthUserContext,
  ): T & { restaurantId: string } {
    const restaurantId = query.restaurantId ?? user?.rid;

    if (!restaurantId) {
      throw new BadRequestException('restaurantId is required');
    }

    return {
      ...query,
      restaurantId,
    };
  }

  private async resolveAdminReservationRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): Promise<string> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (!requestedRestaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      return requestedRestaurantId;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (user.rid) {
        return user.rid;
      }

      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (!requestedRestaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      const restaurant = await this.customerAppRepository.findRestaurantScope(
        requestedRestaurantId,
        user.tid,
      );

      if (!restaurant) {
        throw new ForbiddenException(
          'You cannot access resources outside your tenant restaurants',
        );
      }

      return restaurant.id;
    }

    if (!user.rid) {
      throw new ForbiddenException('Restaurant context is required');
    }

    if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }

    return user.rid;
  }

  private resolveAdminReservationBranchId(
    user: AuthUserContext,
    requestedBranchId?: string,
  ) {
    if (user.role === UserRoleEnum.BRANCH_ADMIN && user.bid) {
      if (requestedBranchId && requestedBranchId !== user.bid) {
        throw new ForbiddenException(
          'You cannot access resources outside your branch',
        );
      }

      return user.bid;
    }

    return requestedBranchId;
  }

  private async resolveCustomer(
    user: AuthUserContext,
    requestedCustomerId?: string,
  ) {
    if (user.role === UserRoleEnum.CUSTOMER) {
      if (requestedCustomerId && requestedCustomerId !== user.uid) {
        throw new BadRequestException(
          'Customers can only manage their own customer app data',
        );
      }

      const customer = await this.customerAppRepository.findCustomerProfile(
        user.uid,
      );
      if (!customer || customer.deletedAt) {
        throw new NotFoundException('Customer not found');
      }

      return customer;
    }

    if (!requestedCustomerId) {
      throw new BadRequestException(
        'customerId is required when managing customer app data on behalf of a customer',
      );
    }

    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    if (!user.rid) {
      throw new ForbiddenException('Restaurant context is required');
    }

    const activeCustomer = await this.customerAppRepository.findActiveCustomer(
      requestedCustomerId,
      user.tid,
      user.rid,
    );

    if (!activeCustomer) {
      throw new BadRequestException('Customer not found for this restaurant');
    }

    const customer = await this.customerAppRepository.findCustomerProfile(
      activeCustomer.id,
    );

    if (!customer || customer.deletedAt) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  private readFavoriteMenuItemIds(
    metadata: Prisma.JsonValue | null | undefined,
  ) {
    const root = this.asObject(metadata);
    const customerApp = this.asObject(root.customerApp);
    const ids = customerApp.favoriteMenuItemIds;

    if (!Array.isArray(ids)) {
      return [] as string[];
    }

    return ids.filter((item): item is string => typeof item === 'string');
  }

  private writeFavoriteMenuItemIds(
    metadata: Prisma.JsonValue | null | undefined,
    favoriteMenuItemIds: string[],
  ): Prisma.JsonObject {
    return this.writeCustomerAppMetadata(metadata, { favoriteMenuItemIds });
  }

  private writeCustomerAppMetadata(
    metadata: Prisma.JsonValue | null | undefined,
    patch: Partial<NonNullable<FavoriteMetadataShape['customerApp']>>,
  ): Prisma.JsonObject {
    const root: FavoriteMetadataShape = this.asObject(metadata);
    const customerApp = this.asObject(root.customerApp);

    return {
      ...root,
      customerApp: {
        ...customerApp,
        ...patch,
      },
    } as unknown as Prisma.JsonObject;
  }

  private sortAdminTableReservations(
    reservations: Array<
      TableReservationRecord & {
        customer: AdminTableReservationResponse['customer'];
      }
    >,
    sortBy: string,
    sortOrder: string,
  ) {
    const multiplier = sortOrder.toUpperCase() === 'ASC' ? 1 : -1;

    return [...reservations].sort((a, b) => {
      if (sortBy === 'guestCount') {
        return (a.guestCount - b.guestCount) * multiplier;
      }

      const left =
        sortBy === 'reservationDate' ? a.reservationDate : a.createdAt;
      const right =
        sortBy === 'reservationDate' ? b.reservationDate : b.createdAt;

      return left.localeCompare(right) * multiplier;
    });
  }

  private readTableReservations(
    metadata: Prisma.JsonValue | null | undefined,
  ): TableReservationRecord[] {
    const value = this.readPath(metadata, ['customerApp', 'tableReservations']);
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }

        const reservation = item as Record<string, unknown>;
        if (
          typeof reservation.id !== 'string' ||
          typeof reservation.branchId !== 'string' ||
          typeof reservation.reservationDate !== 'string' ||
          typeof reservation.guestCount !== 'number' ||
          typeof reservation.createdAt !== 'string'
        ) {
          return null;
        }

        return {
          id: reservation.id,
          branchId: reservation.branchId,
          reservationDate: reservation.reservationDate,
          guestCount: reservation.guestCount,
          note: typeof reservation.note === 'string' ? reservation.note : null,
          status:
            reservation.status === 'CANCELLED'
              ? 'CANCELLED'
              : ('REQUESTED' as const),
          createdAt: reservation.createdAt,
          cancelledAt:
            typeof reservation.cancelledAt === 'string'
              ? reservation.cancelledAt
              : null,
        };
      })
      .filter((item): item is TableReservationRecord => item !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private readLoyaltyRedemptions(
    metadata: Prisma.JsonValue | null | undefined,
  ): LoyaltyRedemptionRecord[] {
    const value = this.readPath(metadata, [
      'customerApp',
      'loyaltyRedemptions',
    ]);
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }

        const redemption = item as Record<string, unknown>;
        if (
          typeof redemption.id !== 'string' ||
          typeof redemption.points !== 'number' ||
          typeof redemption.createdAt !== 'string'
        ) {
          return null;
        }

        return {
          id: redemption.id,
          points: redemption.points,
          note: typeof redemption.note === 'string' ? redemption.note : null,
          createdAt: redemption.createdAt,
        };
      })
      .filter((item): item is LoyaltyRedemptionRecord => item !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async mapMenuItem(item: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    ingredients: string | null;
    nutritionalInformation: string | null;
    imageUrl: string | null;
    basePrice: Prisma.Decimal;
    prepTimeMinutes: number | null;
    restaurant?: {
      id: string;
      name: string;
      logoUrl?: string | null;
      tagline?: string | null;
    };
    category?: { id: string; name: string; imageUrl?: string | null };
    variations?: Array<{
      id: string;
      name: string;
      description: string | null;
      requiredModifierId?: string | null;
      price: Prisma.Decimal;
      isDefault: boolean;
    }>;
    modifierLinks?: Array<{
      sortOrder: number;
      modifierGroup: {
        id: string;
        name: string;
        minSelect: number;
        maxSelect: number;
        isRequired: boolean;
        modifiers: Array<{
          id: string;
          name: string;
          priceDelta: Prisma.Decimal;
          itemPriceOverrides?: Array<{
            menuItemId: string;
            priceDelta: Prisma.Decimal;
          }>;
        }>;
      };
    }>;
    branchOverrides?: Array<{
      priceOverride: Prisma.Decimal | null;
      isAvailable: boolean;
    }>;
  }) {
    const branchOverride = item.branchOverrides?.[0];

    return {
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description,
      ingredients: item.ingredients,
      nutritionalInformation: item.nutritionalInformation,
      imageUrl: await this.resolveMediaUrl(item.imageUrl),
      basePrice: branchOverride?.priceOverride ?? item.basePrice,
      prepTimeMinutes: item.prepTimeMinutes,
      restaurant: item.restaurant
        ? {
            ...item.restaurant,
            logoUrl: await this.resolveMediaUrl(item.restaurant.logoUrl),
          }
        : null,
      category: item.category
        ? {
            ...item.category,
            imageUrl: await this.resolveMediaUrl(item.category.imageUrl),
          }
        : null,
      variations: item.variations ?? [],
      modifierGroups: (item.modifierLinks ?? []).map((link) => ({
        id: link.modifierGroup.id,
        name: link.modifierGroup.name,
        minSelect: link.modifierGroup.minSelect,
        maxSelect: link.modifierGroup.maxSelect,
        isRequired: link.modifierGroup.isRequired,
        sortOrder: link.sortOrder,
        modifiers: link.modifierGroup.modifiers.map((modifier) => ({
          id: modifier.id,
          name: modifier.name,
          priceDelta:
            modifier.itemPriceOverrides?.find(
              (itemOverride) => itemOverride.menuItemId === item.id,
            )?.priceDelta ?? modifier.priceDelta,
        })),
      })),
      isAvailable: branchOverride?.isAvailable ?? true,
    };
  }

  private async resolveMediaUrl(value: string | null | undefined) {
    return this.storageService.resolveViewUrl(value);
  }

  private async resolveCuisineMedia<T extends { imageUrl?: string | null }>(
    cuisine: T,
  ) {
    return {
      ...cuisine,
      imageUrl: await this.resolveMediaUrl(cuisine.imageUrl ?? null),
    };
  }

  private async resolveBranchMedia<
    T extends { logoUrl?: string | null; coverImage?: string | null } | null,
  >(branch: T) {
    if (!branch) {
      return null;
    }

    return {
      ...branch,
      logoUrl: await this.resolveMediaUrl(branch.logoUrl ?? null),
      coverImage: await this.resolveMediaUrl(branch.coverImage ?? null),
    };
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

  private readNumberValue(source: unknown, paths: string[][]): number {
    for (const path of paths) {
      const value = this.readPath(source, path);
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
    }

    return 0;
  }

  private readRestaurantCurrency(source: unknown): string | null {
    return this.readStringValue(source, [
      ['customerApp', 'currency'],
      ['checkout', 'currency'],
      ['payments', 'currency'],
      ['currency'],
      ['defaultCurrency'],
    ]);
  }

  private readFaqs(
    source: unknown,
    paths: string[][],
  ): CustomerAppFaqItem[] | null {
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

    return null;
  }

  private readPath(source: unknown, path: string[]): unknown {
    let current: unknown = source;

    for (const key of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }

      current = (current as Record<string, unknown>)[key];
    }

    return current;
  }

  private asObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }
}
