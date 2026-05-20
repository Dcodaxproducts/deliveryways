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
import { DEFAULT_MENU_ITEM_LABELS } from '../menu/item/dto';
import { CouponsService, PromotionPreview } from '../coupons/coupons.service';

type PublicMenuItemVariation = {
  id: string;
  name: string;
  description: string | null;
  price: Prisma.Decimal;
  isDefault: boolean;
  itemPriceOverrides?: Array<{
    menuItemId: string;
    price: Prisma.Decimal;
    pickupPrice: Prisma.Decimal | null;
    displayText: string | null;
  }>;
  modifierPriceOverrides?: Array<{
    menuItemId?: string | null;
    modifierId: string;
    priceDelta: Prisma.Decimal;
    modifier?: PublicMenuItemModifier;
  }>;
};

type PublicMenuItemModifier = {
  id: string;
  name: string;
  priceDelta?: Prisma.Decimal;
  sortOrder: number;
  isActive?: boolean;
  itemPriceOverrides?: Array<{
    menuItemId: string;
    priceDelta: Prisma.Decimal;
  }>;
  variationPriceOverrides?: Array<{
    menuItemId?: string | null;
    variationId: string;
    priceDelta: Prisma.Decimal;
  }>;
};

type PublicMenuItemVariationOverride = {
  menuItemId: string;
  price: Prisma.Decimal;
  pickupPrice: Prisma.Decimal | null;
  displayText: string | null;
  variation: PublicMenuItemVariation;
};

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
    private readonly couponsService?: CouponsService,
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
    const promotionContext = await this.loadPromotionContext(
      customer.restaurantId,
      customer.branchId ?? undefined,
    );

    return {
      data: await Promise.all(
        items.map((item) =>
          this.mapMenuItem(item, promotionContext.promotions),
        ),
      ),
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
    const promotionContext = await this.loadPromotionContext(
      resolvedQuery.restaurantId,
      resolvedQuery.branchId,
    );

    return {
      data: {
        cuisine: await this.resolveCuisineMedia(cuisine),
        items: await Promise.all(
          items.map((item) =>
            this.mapMenuItem(item, promotionContext.promotions),
          ),
        ),
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
    const promotionContext = await this.loadPromotionContext(
      resolvedQuery.restaurantId,
      resolvedQuery.branchId,
    );
    if (
      !promotionContext.menuItemIds.length &&
      !promotionContext.categoryIds.length
    ) {
      return {
        data: [],
        message: 'Promotional items fetched successfully',
      };
    }

    const items = await this.customerAppRepository.listPromotionalItems(
      resolvedQuery,
      {
        menuItemIds: promotionContext.menuItemIds,
        categoryIds: promotionContext.categoryIds,
      },
    );

    return {
      data: await Promise.all(
        items.map((item) =>
          this.mapMenuItem(item, promotionContext.promotions),
        ),
      ),
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

    const promotionContext = await this.loadPromotionContext(
      resolvedQuery.restaurantId,
      resolvedQuery.branchId,
    );

    return {
      data: await this.mapMenuItem(item, promotionContext.promotions),
      message: 'Menu item fetched successfully',
    };
  }

  async getHomeScreen(query: HomeScreenQueryDto, user?: AuthUserContext) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    const { restaurant, branch } = await this.getPublicContent(
      resolvedQuery,
      user,
    );
    const promotionContext = await this.loadPromotionContext(
      resolvedQuery.restaurantId,
      resolvedQuery.branchId,
    );
    const [cuisines, promotionalItems, faqs] = await Promise.all([
      this.customerAppRepository.listCuisineCategories({
        ...resolvedQuery,
        page: 1,
        limit: query.cuisineLimit,
        sortBy: 'sortOrder',
        sortOrder: 'ASC',
      }),
      promotionContext.menuItemIds.length || promotionContext.categoryIds.length
        ? this.customerAppRepository.listPromotionalItems(resolvedQuery, {
            menuItemIds: promotionContext.menuItemIds,
            categoryIds: promotionContext.categoryIds,
          })
        : Promise.resolve([]),
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
        landingPopup: branch
          ? this.resolveBranchClosedPeriodPopup(branch.settings)
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
          promotionalItems.map((item) =>
            this.mapMenuItem(item, promotionContext.promotions),
          ),
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

  private async mapMenuItem(
    item: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      ingredients: string | null;
      nutritionalInformation: string | null;
      dietaryFlags?: Prisma.JsonValue | null;
      allergenFlags?: Prisma.JsonValue | null;
      imageUrl: string | null;
      basePrice: Prisma.Decimal;
      depositAmount?: Prisma.Decimal | null;
      prepTimeMinutes: number | null;
      restaurant?: {
        id: string;
        name: string;
        logoUrl?: string | null;
        tagline?: string | null;
        settings?: unknown;
        tenant?: { settings?: unknown } | null;
      };
      category?: {
        id: string;
        name: string;
        imageUrl?: string | null;
        variations?: PublicMenuItemVariation[];
        variationLinks?: Array<{
          sortOrder: number;
          isDefault: boolean;
          isActive: boolean;
          variation: PublicMenuItemVariation;
        }>;
      };
      variations?: PublicMenuItemVariation[];
      variationPriceOverrides?: PublicMenuItemVariationOverride[];
      modifierPriceOverrides?: Array<{
        menuItemId?: string | null;
        modifierId?: string;
        priceDelta: Prisma.Decimal;
        modifier: PublicMenuItemModifier;
      }>;
      modifierLinks?: Array<{
        sortOrder: number;
        modifierGroup: {
          id: string;
          name: string;
          minSelect: number;
          maxSelect: number;
          isRequired: boolean;
          modifierLinks: Array<{
            sortOrder: number;
            modifier: {
              id: string;
              name: string;
              priceDelta: Prisma.Decimal;
              itemPriceOverrides?: Array<{
                menuItemId: string;
                priceDelta: Prisma.Decimal;
              }>;
            };
          }>;
        };
      }>;
      branchOverrides?: Array<{
        priceOverride: Prisma.Decimal | null;
        isAvailable: boolean;
      }>;
    },
    promotions: Array<Record<string, unknown>> = [],
  ) {
    const branchOverride = item.branchOverrides?.[0];
    const variations = this.resolvePublicItemVariations(item);
    const settings =
      item.restaurant?.tenant?.settings ?? item.restaurant?.settings;
    const dietaryFlags = this.readStringArray(item.dietaryFlags).filter(
      (flag) => flag !== '__SPLIT_PIZZA_ENABLED__',
    );
    const productLabels = this.resolveProductLabels(dietaryFlags, settings);
    const allergenAdditiveLabels = this.resolveAllergenAdditiveLabels(
      item.allergenFlags,
      settings,
    );
    const effectiveBasePrice = branchOverride?.priceOverride ?? item.basePrice;
    const itemPromotion = this.resolveBestScopedItemPromotion(
      item.id,
      item.category?.id ?? null,
      effectiveBasePrice,
      promotions,
    );
    const normalizedVariations = this.normalizeVariations(
      variations,
      item.id,
    ).map((variation) => {
      const variationPromotion = this.resolveBestScopedItemPromotion(
        item.id,
        item.category?.id ?? null,
        variation.price,
        promotions,
      );

      return {
        ...variation,
        discountedPrice: variationPromotion?.discountedAmount ?? null,
        promotion: variationPromotion ?? null,
      };
    });

    return {
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description,
      ingredients: item.ingredients,
      nutritionalInformation: item.nutritionalInformation,
      dietaryFlags,
      allergenFlags: this.readStringArray(item.allergenFlags),
      labels: dietaryFlags,
      productLabels,
      allergens: allergenAdditiveLabels.allergens,
      additives: allergenAdditiveLabels.additives,
      allergenCodes: this.readStringArray(item.allergenFlags),
      allergenAdditives: [
        ...allergenAdditiveLabels.allergens,
        ...allergenAdditiveLabels.additives,
      ],
      allergenPdfUrl: await this.resolveMediaUrl(
        this.resolveRestaurantAllergenPdfUrl(item.restaurant?.settings) ??
          (item as { allergenPdfUrl?: string | null }).allergenPdfUrl,
      ),
      imageUrl: await this.resolveMediaUrl(item.imageUrl),
      basePrice: effectiveBasePrice,
      discountedBasePrice: itemPromotion?.discountedAmount ?? null,
      promotion: itemPromotion ?? null,
      depositAmount: item.depositAmount ? Number(item.depositAmount) : null,
      prepTimeMinutes: item.prepTimeMinutes,
      restaurant: item.restaurant
        ? {
            id: item.restaurant.id,
            name: item.restaurant.name,
            logoUrl: await this.resolveMediaUrl(item.restaurant.logoUrl),
            tagline: item.restaurant.tagline ?? null,
          }
        : null,
      category: item.category
        ? {
            ...item.category,
            imageUrl: await this.resolveMediaUrl(item.category.imageUrl),
          }
        : null,
      variations: normalizedVariations,
      modifierLinks: item.modifierLinks ?? [],
      modifierPriceOverrides: item.modifierPriceOverrides ?? [],
      modifiers: (item.modifierPriceOverrides ?? []).map((override) => ({
        id: override.modifier.id,
        name: override.modifier.name,
        sortOrder: override.modifier.sortOrder,
        priceDelta: override.priceDelta,
      })),
      isAvailable: branchOverride?.isAvailable ?? true,
    };
  }

  private resolveBranchClosedPeriodPopup(settings: unknown) {
    const temporaryClosure = this.resolveActiveTemporaryClosure(settings);
    if (temporaryClosure) {
      return {
        show: true,
        type: 'TEMPORARY_CLOSURE',
        title: 'Branch temporarily closed',
        message:
          temporaryClosure.message ??
          temporaryClosure.reason ??
          'This branch is temporarily closed.',
        period: {
          fromDate: temporaryClosure.closedAt ?? null,
          toDate: temporaryClosure.closedUntil ?? null,
        },
        temporaryClosure,
      };
    }

    const holiday = this.resolveCurrentOrUpcomingHoliday(settings);
    if (holiday) {
      const fromDate = holiday.date ?? holiday.fromDate ?? null;
      const toDate = holiday.date ?? holiday.toDate ?? null;
      return {
        show: true,
        type: 'HOLIDAY_CLOSURE',
        title: 'Holiday / vacation closure',
        message: holiday.note ?? 'This branch has upcoming holiday hours.',
        period: {
          fromDate,
          toDate,
        },
        holidayOpeningHour: holiday,
      };
    }

    return null;
  }

  private resolveActiveTemporaryClosure(settings: unknown) {
    const closure = this.readPath(settings, ['temporaryClosure']);
    if (!closure || typeof closure !== 'object' || Array.isArray(closure)) {
      return null;
    }

    const normalized = closure as {
      isClosed?: boolean;
      closedAt?: string | null;
      closedUntil?: string | null;
      reason?: string | null;
      message?: string | null;
    };

    if (!normalized.isClosed) {
      return null;
    }

    if (
      normalized.closedUntil &&
      new Date(normalized.closedUntil).getTime() <= Date.now()
    ) {
      return null;
    }

    return {
      isClosed: true,
      closedAt: normalized.closedAt ?? null,
      closedUntil: normalized.closedUntil ?? null,
      reason: normalized.reason ?? null,
      message: normalized.message ?? null,
    };
  }

  private resolveCurrentOrUpcomingHoliday(settings: unknown) {
    const holidays = this.readPath(settings, ['holidayOpeningHours']);
    if (!Array.isArray(holidays)) {
      return null;
    }

    const today = new Date().toISOString().slice(0, 10);
    return (
      holidays
        .map((item) => this.normalizeHolidayOpeningHour(item))
        .filter((item): item is NonNullable<typeof item> => !!item)
        .filter(
          (item) => item.isClosed && this.resolveHolidayEndDate(item) >= today,
        )
        .sort((a, b) =>
          this.resolveHolidayStartDate(a).localeCompare(
            this.resolveHolidayStartDate(b),
          ),
        )[0] ?? null
    );
  }

  private normalizeHolidayOpeningHour(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }

    const item = input as Record<string, unknown>;
    const date = typeof item.date === 'string' ? item.date : undefined;
    const fromDate =
      typeof item.fromDate === 'string' ? item.fromDate : undefined;
    const toDate = typeof item.toDate === 'string' ? item.toDate : undefined;

    if (!date && (!fromDate || !toDate)) {
      return null;
    }

    return {
      date,
      fromDate,
      toDate,
      isClosed: item.isClosed === true,
      openTime: typeof item.openTime === 'string' ? item.openTime : null,
      closeTime: typeof item.closeTime === 'string' ? item.closeTime : null,
      note: typeof item.note === 'string' ? item.note : null,
    };
  }

  private resolveHolidayStartDate(holiday: {
    date?: string;
    fromDate?: string;
  }) {
    return holiday.date ?? holiday.fromDate ?? '';
  }

  private resolveHolidayEndDate(holiday: { date?: string; toDate?: string }) {
    return holiday.date ?? holiday.toDate ?? '';
  }

  private async loadPromotionContext(restaurantId: string, branchId?: string) {
    const promotions =
      (await this.couponsService?.getActiveAutoApplyPromotions(
        restaurantId,
        branchId,
      )) ?? [];
    const menuItemIds = new Set<string>();
    const categoryIds = new Set<string>();

    for (const promotion of promotions) {
      if (promotion.applyMode !== 'SCOPED_ITEMS') {
        continue;
      }

      const scopedMenuItemIds = this.collectPromotionScopeIds(
        promotion.scopeMenuItem?.id ?? null,
        (promotion.scopeMenuItems ?? []).map((entry) => entry.menuItem.id),
      );
      const scopedCategoryIds = this.collectPromotionScopeIds(
        promotion.scopeCategory?.id ?? null,
        (promotion.scopeCategories ?? []).map((entry) => entry.menuCategory.id),
      );

      scopedMenuItemIds.forEach((id) => menuItemIds.add(id));
      scopedCategoryIds.forEach((id) => categoryIds.add(id));
    }

    return {
      promotions,
      menuItemIds: [...menuItemIds],
      categoryIds: [...categoryIds],
    };
  }

  private resolveBestScopedItemPromotion(
    menuItemId: string,
    categoryId: string | null,
    baseAmount: Prisma.Decimal,
    promotions: Array<Record<string, unknown>>,
  ): PromotionPreview | null {
    let best: PromotionPreview | null = null;

    for (const promotion of promotions) {
      if ((promotion.applyMode as string) !== 'SCOPED_ITEMS') {
        continue;
      }

      const scopedMenuItemIds = this.collectPromotionScopeIds(
        (promotion.scopeMenuItem as { id?: string } | null | undefined)?.id ??
          null,
        (
          (promotion.scopeMenuItems as Array<{ menuItem: { id: string } }>) ??
          []
        ).map((entry) => entry.menuItem.id),
      );
      const scopedCategoryIds = this.collectPromotionScopeIds(
        (promotion.scopeCategory as { id?: string } | null | undefined)?.id ??
          null,
        (
          (promotion.scopeCategories as Array<{
            menuCategory: { id: string };
          }>) ?? []
        ).map((entry) => entry.menuCategory.id),
      );

      const matches =
        (!scopedMenuItemIds.length && !scopedCategoryIds.length) ||
        scopedMenuItemIds.includes(menuItemId) ||
        (!!categoryId && scopedCategoryIds.includes(categoryId));

      if (!matches) {
        continue;
      }

      const preview = this.buildScopedPromotionPreview(
        promotion as {
          id: string;
          title: string;
          description: string | null;
          applyMode: string;
          discountType: string;
          discountValue: Prisma.Decimal;
          maxDiscountAmount: Prisma.Decimal | null;
        },
        baseAmount,
      );

      if (!best || preview.discountAmount > best.discountAmount) {
        best = preview;
      }
    }

    return best;
  }

  private buildScopedPromotionPreview(
    promotion: {
      id: string;
      title: string;
      description: string | null;
      applyMode: string;
      discountType: string;
      discountValue: Prisma.Decimal;
      maxDiscountAmount: Prisma.Decimal | null;
    },
    baseAmount: Prisma.Decimal | number,
  ): PromotionPreview {
    const amount =
      baseAmount instanceof Prisma.Decimal
        ? baseAmount
        : new Prisma.Decimal(baseAmount);
    let discountAmount = new Prisma.Decimal(0);

    if (promotion.discountType === 'FLAT') {
      discountAmount = Prisma.Decimal.min(amount, promotion.discountValue);
    } else {
      discountAmount = amount.mul(promotion.discountValue).div(100);
      if (promotion.maxDiscountAmount) {
        discountAmount = Prisma.Decimal.min(
          discountAmount,
          promotion.maxDiscountAmount,
        );
      }
      discountAmount = Prisma.Decimal.min(discountAmount, amount);
    }

    discountAmount = discountAmount.toDecimalPlaces(2);
    const discountedAmount = Prisma.Decimal.max(
      amount.minus(discountAmount),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);

    return {
      promotionId: promotion.id,
      title: promotion.title,
      description: promotion.description,
      applyMode: promotion.applyMode as PromotionPreview['applyMode'],
      discountType: promotion.discountType as PromotionPreview['discountType'],
      discountValue: Number(promotion.discountValue),
      maxDiscountAmount: promotion.maxDiscountAmount
        ? Number(promotion.maxDiscountAmount)
        : null,
      discountAmount: Number(discountAmount),
      discountedAmount: Number(discountedAmount),
    };
  }

  private collectPromotionScopeIds(primary: string | null, extras: string[]) {
    return [...new Set([...(primary ? [primary] : []), ...extras])];
  }

  private resolvePublicItemVariations(item: {
    id: string;
    variations?: PublicMenuItemVariation[];
    variationPriceOverrides?: PublicMenuItemVariationOverride[];
    category?: {
      variations?: PublicMenuItemVariation[];
      variationLinks?: Array<{
        sortOrder: number;
        isDefault: boolean;
        isActive: boolean;
        variation: PublicMenuItemVariation;
      }>;
    };
  }) {
    if (item.variationPriceOverrides?.length) {
      return item.variationPriceOverrides.map((override) => ({
        ...override.variation,
        price: override.price,
        pickupPrice: override.pickupPrice ?? null,
        displayText: override.displayText ?? null,
        itemPriceOverrides: [{ ...override, menuItemId: override.menuItemId }],
      }));
    }

    if (item.category?.variationLinks?.length) {
      return item.category.variationLinks.map((link) => ({
        ...link.variation,
        sortOrder: link.sortOrder,
        isDefault: link.isDefault,
        isActive: link.isActive,
      }));
    }

    return item.variations ?? item.category?.variations;
  }

  private normalizeVariations<
    T extends {
      price?: Prisma.Decimal | null;
      itemPriceOverrides?: Array<{
        menuItemId: string;
        price: Prisma.Decimal;
        pickupPrice: Prisma.Decimal | null;
        displayText: string | null;
      }>;
    },
  >(variations: T[] | undefined | null, menuItemId?: string) {
    return (variations ?? []).map((variation) => {
      const override = variation.itemPriceOverrides?.find(
        (itemOverride) => itemOverride.menuItemId === menuItemId,
      );

      return {
        ...variation,
        price: override?.price ?? variation.price ?? new Prisma.Decimal(0),
        pickupPrice: override?.pickupPrice ?? null,
        displayText: override?.displayText ?? null,
      };
    });
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

  private resolveRestaurantAllergenPdfUrl(settings: unknown) {
    return this.readStringValue(settings, [
      ['customerApp', 'allergenPdfUrl'],
      ['customerApp', 'allergensPdfUrl'],
      ['allergenPdfUrl'],
      ['allergensPdfUrl'],
    ]);
  }

  private resolveProductLabels(codes: string[], settings: unknown) {
    const configuredLabels = this.readProductLabels(
      this.readPath(settings, ['productLabels']) ??
        this.readPath(settings, ['menu', 'productLabels']),
    );
    const labels = configuredLabels.length
      ? configuredLabels
      : DEFAULT_MENU_ITEM_LABELS;
    const byValue = new Map(labels.map((entry) => [entry.value, entry]));

    return codes.map((value) => ({
      value,
      label: byValue.get(value)?.label ?? value,
    }));
  }

  private readProductLabels(input: unknown) {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }

        const value = (entry as Record<string, unknown>).value;
        const label = (entry as Record<string, unknown>).label;

        if (typeof value !== 'string' || typeof label !== 'string') {
          return null;
        }

        return { value: value.trim(), label: label.trim() };
      })
      .filter(
        (entry): entry is { value: string; label: string } =>
          !!entry && entry.value.length > 0 && entry.label.length > 0,
      );
  }

  private resolveAllergenAdditiveLabels(
    codesInput: unknown,
    restaurantSettings: unknown,
  ) {
    const codes = this.readStringArray(codesInput);
    const templates = this.readAllergenAdditiveTemplates(restaurantSettings);
    const allergensByCode = new Map(
      templates.allergens.map((entry) => [entry.code, entry]),
    );
    const additivesByCode = new Map(
      templates.additives.map((entry) => [entry.code, entry]),
    );
    const allergens: Array<{ code: string; label: string }> = [];
    const additives: Array<{ code: string; label: string }> = [];

    for (const code of codes) {
      const additive = additivesByCode.get(code);
      if (additive) {
        additives.push({ code, label: additive.label });
        continue;
      }

      const allergen = allergensByCode.get(code);
      allergens.push({ code, label: allergen?.label ?? code });
    }

    return { allergens, additives };
  }

  private resolveAllergenAdditiveText(
    codesInput: unknown,
    restaurantSettings: unknown,
  ) {
    const codes = this.readStringArray(codesInput);
    if (!codes.length) {
      return [];
    }

    const templates = this.readAllergenAdditiveTemplates(restaurantSettings);
    const byCode = new Map(
      [...templates.allergens, ...templates.additives].map((entry) => [
        entry.code,
        entry,
      ]),
    );

    return codes.map((code) => ({
      code,
      label: byCode.get(code)?.label ?? code,
    }));
  }

  private readAllergenAdditiveTemplates(settings: unknown) {
    const templates =
      this.readPath(settings, ['customerApp', 'allergenAdditiveTemplates']) ??
      this.readPath(settings, ['allergenAdditiveTemplates']);

    return {
      allergens: this.readTemplateEntries(
        this.readObjectValue(templates, 'allergens'),
      ),
      additives: this.readTemplateEntries(
        this.readObjectValue(templates, 'additives'),
      ),
    };
  }

  private readTemplateEntries(input: unknown) {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }

        const code = (entry as Record<string, unknown>).code;
        const label = (entry as Record<string, unknown>).label;

        if (typeof code !== 'string' || typeof label !== 'string') {
          return null;
        }

        return { code: code.trim(), label: label.trim() };
      })
      .filter(
        (entry): entry is { code: string; label: string } =>
          !!entry && entry.code.length > 0 && entry.label.length > 0,
      );
  }

  private readObjectValue(input: unknown, key: string) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return undefined;
    }

    return (input as Record<string, unknown>)[key];
  }

  private readStringArray(input: unknown): string[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input.filter((value): value is string => typeof value === 'string');
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
