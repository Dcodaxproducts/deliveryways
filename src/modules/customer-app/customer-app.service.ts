import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AddressRefType,
  CouponDealSelectionMode,
  LocalizationEntityType,
  ModifierSelectionType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import {
  buildPaginationMeta,
  CustomerAppFaqItem,
  extractCustomerAppFaqCategories,
  isRestaurantMenuAvailableAt,
  normalizeCustomerAppFaqItem,
  resolveAvailablePaymentMethods,
} from '../../common/utils';
import {
  CreateTableReservationDto,
  HomeScreenQueryDto,
  ListAdminTableReservationsQueryDto,
  ListCuisineItemsQueryDto,
  ListCuisinesQueryDto,
  ListMenuCategoriesQueryDto,
  ListMenuCategoryItemsQueryDto,
  ListCustomerFavoritesQueryDto,
  ListCustomerGiftCardsQueryDto,
  ListCustomerPromotionsQueryDto,
  ListPublicOrderReviewsQueryDto,
  ListPublicBranchesQueryDto,
  ListPublicMenuItemsQueryDto,
  ListPromotionalItemsQueryDto,
  ListTableReservationsQueryDto,
  PublicBranchStatsQueryDto,
  PublicMenuItemBySlugQueryDto,
  PublicRestaurantQueryDto,
  SubmitContactFormDto,
  TABLE_RESERVATION_STATUS_VALUES,
  TableReservationStatus,
  CreateWalletTopUpDto,
  GuestPurchaseGiftCardDto,
  ListPublicGiftCardsQueryDto,
  ListWalletHistoryQueryDto,
  PurchaseGiftCardDto,
  RedeemGiftCardDto,
  RedeemLoyaltyPointsDto,
  ToggleFavoriteDto,
  UpdateTableReservationStatusDto,
} from './dto';
import { CustomerAppRepository } from './customer-app.repository';
import { LoyaltyWalletService } from '../loyalty-wallet/loyalty-wallet.service';
import { StorageService } from '../storage/storage.service';
import { PaymentsService } from '../payments/payments.service';
import { DEFAULT_MENU_ITEM_LABELS } from '../menu/item/dto';
import { CouponsService, PromotionPreview } from '../coupons/coupons.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DEFAULT_LOCALE } from '../localizations';
import {
  EntityTranslationRef,
  LocalizationsService,
} from '../localizations/localizations.service';
import { normalizeLocale } from '../localizations/localization.util';
import { MailerService } from '../mailer/mailer.service';
import { GlobalSettingsService } from '../global-settings/global-settings.service';
import { ContactSubmissionsService } from '../contact-submissions/contact-submissions.service';

type AutoApplyPromotion = Awaited<
  ReturnType<CouponsService['getActiveAutoApplyPromotions']>
>[number];

type CustomerCoupon = Awaited<
  ReturnType<CouponsService['getActiveCustomerCoupons']>
>[number];

type ActiveHappyHour = Awaited<
  ReturnType<CouponsService['getActiveHappyHours']>
>[number];

type PublicPromotionScopeEntity = {
  id: string;
  name: string;
  slug?: string | null;
  imageUrl?: string | null;
  basePrice?: Prisma.Decimal | null;
};

type PublicDealScopeMenuItem = { id: string } & Record<string, unknown>;

type PublicMenuItemVariation = {
  id: string;
  name: string;
  description: string | null;
  price: Prisma.Decimal;
  sortOrder?: number;
  isDefault: boolean;
  isActive?: boolean;
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
  priceDelta: Prisma.Decimal;
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

type PublicMenuItemModifierGroupLink = {
  id: string;
  sortOrder: number;
  selectionType: ModifierSelectionType;
  minSelect: number;
  maxSelect: number;
  modifierGroup: {
    id: string;
    name: string;
    description?: string | null;
    minSelect: number;
    maxSelect: number;
    isRequired: boolean;
    sortOrder: number;
    isActive: boolean;
    modifierLinks: Array<{
      id: string;
      sortOrder: number;
      modifier: PublicMenuItemModifier;
    }>;
  };
};

type PublicMenuItemVariationOverride = {
  menuItemId: string;
  price: Prisma.Decimal;
  pickupPrice: Prisma.Decimal | null;
  displayText: string | null;
  variation: PublicMenuItemVariation;
};

type PublicRestaurantMenuScheduleLink = {
  isActive?: boolean;
  restaurantMenu?: {
    isTimed: boolean;
    timingConfig: unknown;
    isActive: boolean;
    deletedAt: Date | string | null;
  } | null;
};

type PublicMenuItemScheduleCarrier = {
  menuLinks?: PublicRestaurantMenuScheduleLink[];
  category?:
    | ({
        menuLinks?: PublicRestaurantMenuScheduleLink[];
      } & Record<string, unknown>)
    | null;
  categoryLinks?: Array<{
    menuCategory?: {
      menuLinks?: PublicRestaurantMenuScheduleLink[];
    } | null;
  }>;
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
  status: TableReservationStatus;
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

interface CustomerAppTranslationContext {
  locale: string;
  fieldsByKey: Map<string, Record<string, string | null>>;
}

@Injectable()
export class CustomerAppService {
  constructor(
    private readonly customerAppRepository: CustomerAppRepository,
    private readonly storageService: StorageService,
    private readonly loyaltyWalletService?: LoyaltyWalletService,
    private readonly paymentsService?: PaymentsService,
    private readonly couponsService?: CouponsService,
    private readonly notificationsService?: NotificationsService,
    @Optional() private readonly localizationsService?: LocalizationsService,
    private readonly mailerService?: MailerService,
    @Optional() private readonly globalSettingsService?: GlobalSettingsService,
    @Optional() private readonly configService?: ConfigService,
    @Optional()
    private readonly contactSubmissionsService?: ContactSubmissionsService,
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
      user,
    );

    return {
      data: await Promise.all(
        this.filterAvailableMenuItems(items).map((item) =>
          this.mapMenuItem(
            item,
            promotionContext.promotions,
            promotionContext.happyHours,
          ),
        ),
      ),
      message: 'Favorite items fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async resolveDomainContext(host: string) {
    const hostname = this.normalizeDomainHost(host);
    const baseDomain = this.normalizeDomainHost(
      this.configService?.get<string>('CUSTOMER_APP_BASE_DOMAIN') ?? '',
    );
    const subdomain = this.extractRestaurantSubdomain(hostname, baseDomain);

    const restaurant =
      await this.customerAppRepository.findRestaurantDomainContext(
        hostname,
        subdomain,
      );

    if (!restaurant) {
      throw new NotFoundException('Restaurant domain context not found');
    }

    const restaurantContext = restaurant as typeof restaurant & {
      branches: Array<{ id: string; name: string }>;
    };
    const defaultBranch = restaurantContext.branches[0] ?? null;

    return {
      data: {
        tenantId: restaurant.tenantId,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        restaurantSlug: restaurant.slug,
        restaurantSubdomain: restaurant.subdomain,
        branchId: defaultBranch?.id ?? null,
        branchName: defaultBranch?.name ?? null,
        host: hostname,
        subdomain: restaurant.subdomain,
        customDomain: restaurant.customDomain,
        customDomainVerified: Boolean(restaurant.customDomainVerifiedAt),
        logoUrl: await this.resolveMediaUrl(restaurant.logoUrl),
        branding: restaurant.branding,
      },
      message: 'Domain context resolved successfully',
    };
  }

  async listPublicBranches(query: ListPublicBranchesQueryDto) {
    const restaurant = await this.customerAppRepository.findRestaurantScope(
      query.restaurantId,
    );
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const { items, total } =
      await this.customerAppRepository.listPublicBranches(query);
    const platformMethodsResponse =
      await this.globalSettingsService?.getPaymentMethods();
    const activePlatformMethods = platformMethodsResponse
      ? platformMethodsResponse.data
          .filter((method) => method.isActive)
          .map((method) => method.code)
      : null;

    return {
      data: items.map((branch) => ({
        id: branch.id,
        restaurantId: branch.restaurantId,
        name: branch.name,
        isMain: branch.isMain,
        isActive: branch.isActive,
        isOnlyBranch: total === 1,
        address: branch.address,
        settings: {
          allowedOrderTypes: this.readStringArrayValue(branch.settings, [
            ['allowedOrderTypes'],
          ]),
          allowedPaymentMethods: resolveAvailablePaymentMethods({
            platformMethods: activePlatformMethods,
            restaurantSettings: restaurant.settings,
            branchSettings: branch.settings,
          }),
          openingHours: this.readBranchScheduleHours(
            branch.settings,
            'openingHours',
          ),
          deliveryHours: this.readBranchScheduleHours(
            branch.settings,
            'deliveryHours',
          ),
          holidayOpeningHours: this.readBranchHolidayOpeningHours(
            branch.settings,
          ),
          temporaryClosure: this.resolveActiveTemporaryClosure(branch.settings),
          tableReservationsEnabled: this.readBooleanValue(branch.settings, [
            ['tableReservationsEnabled'],
          ]),
        },
      })),
      message: 'Branches fetched successfully',
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
    const tenantName = restaurant.tenant?.name ?? restaurant.name;
    const legalProfile = this.extractLegalProfile(restaurant.settings);

    return {
      data: {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        tenantId: restaurant.tenantId,
        tenantName,
        restaurantCoverImage: await this.resolveMediaUrl(restaurant.coverImage),
        title: 'Privacy Policy',
        content: privacyPolicy,
        legalProfile: {
          ...legalProfile,
          ownerName: tenantName,
        },
        policyLink: this.buildPrivacyPolicyLink(restaurant.id),
      },
      message: 'Privacy policy fetched successfully',
    };
  }

  private buildPrivacyPolicyLink(restaurantId: string) {
    return `/api/v1/public-content/privacy-policy?restaurantId=${encodeURIComponent(
      restaurantId,
    )}`;
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

  async getAboutUs(query: PublicRestaurantQueryDto, user?: AuthUserContext) {
    const { restaurant } = await this.getPublicContent(query, user);
    const aboutUs = this.readStringValue(restaurant.settings, [
      ['customerApp', 'aboutUs'],
      ['publicContent', 'aboutUs'],
      ['aboutUs'],
      ['about_us'],
    ]);

    return {
      data: {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        tenantId: restaurant.tenantId,
        tenantName: restaurant.tenant?.name ?? restaurant.name,
        restaurantCoverImage: await this.resolveMediaUrl(restaurant.coverImage),
        title: 'About Us',
        content: aboutUs,
      },
      message: 'About us fetched successfully',
    };
  }

  async submitContactForm(
    query: PublicRestaurantQueryDto,
    dto: SubmitContactFormDto,
    user?: AuthUserContext,
  ) {
    const { restaurant, branch } = await this.getPublicContent(query, user);
    const recipients = this.resolveContactFormRecipients(
      restaurant.supportContact,
    );

    if (!recipients.length) {
      throw new BadRequestException(
        'Contact form recipient email is not configured',
      );
    }

    const name = dto.name.trim();
    const email = dto.email.trim().toLowerCase();
    const subject = dto.subject.trim();
    const message = dto.message.trim();
    const branchLine = branch
      ? `Branch: ${branch.name} (${branch.id})`
      : 'Branch: Not selected';
    const submission =
      await this.contactSubmissionsService?.createPublicSubmission({
        tenantId: restaurant.tenantId,
        restaurantId: restaurant.id,
        branchId: branch?.id ?? null,
        customerId: user?.role === UserRoleEnum.CUSTOMER ? user.uid : undefined,
        name,
        email,
        subject,
        message,
        metadata: {
          source: 'PUBLIC_CONTACT_FORM',
        },
      });

    await Promise.all(
      recipients.map((recipient) =>
        this.mailerService!.sendEmail(
          recipient,
          `Contact form: ${subject}`,
          [
            `Restaurant: ${restaurant.name} (${restaurant.id})`,
            branchLine,
            `Name: ${name}`,
            `Email: ${email}`,
            `Subject: ${subject}`,
            '',
            message,
          ].join('\n'),
        ),
      ),
    );

    return {
      data: {
        ...(submission ? { id: submission.id } : {}),
        restaurantId: restaurant.id,
        branchId: branch?.id ?? null,
        submitted: true,
        notifiedRecipients: recipients.length,
      },
      message: 'Contact form submitted successfully',
    };
  }

  private resolveContactFormRecipients(supportContact: unknown): string[] {
    return this.dedupeEmails([
      this.readStringValue(supportContact, [['email']]),
      ...this.readConfiguredEmails('CONTACT_FORM_SUPERADMIN_EMAILS'),
      ...this.readConfiguredEmails('CONTACT_FORM_SUPPORT_EMAILS'),
      ...this.readConfiguredEmails('PLATFORM_SUPPORT_EMAILS'),
    ]);
  }

  private readConfiguredEmails(key: string): string[] {
    const value = this.configService?.get<string>(key);
    if (!value) {
      return [];
    }

    return value
      .split(',')
      .map((email) => email.trim())
      .filter((email) => email.length > 0);
  }

  private dedupeEmails(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    const emails: string[] = [];
    for (const value of values) {
      const email = value?.trim().toLowerCase();
      if (!email || seen.has(email)) {
        continue;
      }

      seen.add(email);
      emails.push(email);
    }

    return emails;
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

  async listMenuCategories(
    query: ListMenuCategoriesQueryDto,
    user?: AuthUserContext,
  ) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    await this.getPublicContent(resolvedQuery, user);
    const promotionContext = await this.loadPromotionContext(
      resolvedQuery.restaurantId,
      resolvedQuery.branchId,
      user,
    );
    const { items, total } =
      await this.customerAppRepository.listMenuCategories(resolvedQuery, {
        includeItems: false,
      });
    const translationContext = await this.loadTranslationContext(
      resolvedQuery.restaurantId,
      resolvedQuery.locale,
      this.collectMenuCategoryTranslationRefs(items),
    );

    return {
      data: await Promise.all(
        items.map((item) =>
          this.mapMenuCategory(
            item,
            promotionContext.promotions,
            promotionContext.happyHours,
            translationContext,
          ),
        ),
      ),
      message: 'Menu categories fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async listMenuCategoryItems(
    categoryId: string,
    query: ListMenuCategoryItemsQueryDto,
    user?: AuthUserContext,
  ) {
    return this.listItems({ ...query, categoryId }, user);
  }

  async listCuisines(query: ListCuisinesQueryDto, user?: AuthUserContext) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    await this.getPublicContent(resolvedQuery, user);
    const promotionContext = await this.loadPromotionContext(
      resolvedQuery.restaurantId,
      resolvedQuery.branchId,
      user,
    );
    const { items, total } =
      await this.customerAppRepository.listCuisineCategories(resolvedQuery, {
        includeItems: false,
      });
    const translationContext = await this.loadTranslationContext(
      resolvedQuery.restaurantId,
      resolvedQuery.locale,
      this.collectCuisineTranslationRefs(items),
    );

    return {
      data: await Promise.all(
        items.map((item) =>
          this.mapCuisineCategory(
            item,
            promotionContext.promotions,
            promotionContext.happyHours,
            translationContext,
          ),
        ),
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
    const visibleItems = items.filter((item) =>
      this.isMenuItemAvailableForCurrentSchedule(
        item as PublicMenuItemScheduleCarrier,
      ),
    );
    const promotionContext = await this.loadPromotionContext(
      resolvedQuery.restaurantId,
      resolvedQuery.branchId,
      user,
    );
    const translationContext = await this.loadTranslationContext(
      resolvedQuery.restaurantId,
      resolvedQuery.locale,
      [
        { entityType: 'CUISINE', entityId: cuisine.id },
        ...visibleItems.flatMap((item) =>
          this.collectMenuItemTranslationRefs(item),
        ),
      ],
    );

    return {
      data: {
        cuisine: await this.resolveCuisineMedia(
          this.applyEntityTranslation(
            'CUISINE',
            cuisine.id,
            cuisine,
            translationContext,
          ),
        ),
        items: await Promise.all(
          visibleItems.map((item) =>
            this.mapMenuItem(
              item,
              promotionContext.promotions,
              promotionContext.happyHours,
              translationContext,
            ),
          ),
        ),
      },
      message: 'Cuisine items fetched successfully',
      meta: buildPaginationMeta(query, Math.min(total, visibleItems.length)),
    };
  }

  async listPromotionalCuisines(
    query: ListCuisinesQueryDto,
    user?: AuthUserContext,
  ) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    await this.getPublicContent(resolvedQuery, user);
    const promotionContext = await this.loadPromotionContext(
      resolvedQuery.restaurantId,
      resolvedQuery.branchId,
      user,
    );

    if (
      !promotionContext.categoryIds.length &&
      !promotionContext.hasBroadHappyHour
    ) {
      return {
        data: [],
        message: 'Promotional cuisines fetched successfully',
        meta: buildPaginationMeta(query, 0),
      };
    }

    const { items, total } =
      await this.customerAppRepository.listCuisineCategories(resolvedQuery, {
        categoryIds: promotionContext.hasBroadHappyHour
          ? []
          : promotionContext.categoryIds,
        includeItems: false,
      });
    const translationContext = await this.loadTranslationContext(
      resolvedQuery.restaurantId,
      resolvedQuery.locale,
      this.collectCuisineTranslationRefs(items),
    );

    return {
      data: await Promise.all(
        items.map((item) =>
          this.mapCuisineCategory(
            item,
            promotionContext.promotions,
            promotionContext.happyHours,
            translationContext,
          ),
        ),
      ),
      message: 'Promotional cuisines fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async listItems(query: ListPublicMenuItemsQueryDto, user?: AuthUserContext) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    await this.getPublicContent(resolvedQuery, user);
    const { items, total } =
      await this.customerAppRepository.listPublicMenuItems(resolvedQuery);
    const visibleItems = items.filter((item) =>
      this.isMenuItemAvailableForCurrentSchedule(
        item as PublicMenuItemScheduleCarrier,
      ),
    );
    const promotionContext = await this.loadPromotionContext(
      resolvedQuery.restaurantId,
      resolvedQuery.branchId,
      user,
    );
    const translationContext = await this.loadTranslationContext(
      resolvedQuery.restaurantId,
      resolvedQuery.locale,
      visibleItems.flatMap((item) => this.collectMenuItemTranslationRefs(item)),
    );

    return {
      data: await Promise.all(
        visibleItems.map((item) =>
          this.mapHomeMenuItemCard(
            item,
            promotionContext.promotions,
            promotionContext.happyHours,
            translationContext,
          ),
        ),
      ),
      message: 'Menu items fetched successfully',
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
      user,
    );
    if (
      !promotionContext.menuItemIds.length &&
      !promotionContext.categoryIds.length &&
      !promotionContext.hasBroadHappyHour
    ) {
      return {
        data: [],
        message: 'Promotional items fetched successfully',
      };
    }

    const items = await this.customerAppRepository.listPromotionalItems(
      resolvedQuery,
      {
        menuItemIds: promotionContext.hasBroadHappyHour
          ? []
          : promotionContext.menuItemIds,
        categoryIds: promotionContext.hasBroadHappyHour
          ? []
          : promotionContext.categoryIds,
        includeDetails: false,
      },
    );
    const visibleItems = this.filterAvailableMenuItems(items);
    const translationContext = await this.loadTranslationContext(
      resolvedQuery.restaurantId,
      resolvedQuery.locale,
      visibleItems.flatMap((item) => this.collectMenuItemTranslationRefs(item)),
    );

    return {
      data: await Promise.all(
        visibleItems.map((item) =>
          this.mapHomeMenuItemCard(
            item,
            promotionContext.promotions,
            promotionContext.happyHours,
            translationContext,
          ),
        ),
      ),
      message: 'Promotional items fetched successfully',
    };
  }

  async listPromotions(
    query: ListCustomerPromotionsQueryDto,
    user?: AuthUserContext,
  ) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    await this.getPublicContent(resolvedQuery, user);
    const promotionContext = await this.loadPromotionContext(
      resolvedQuery.restaurantId,
      resolvedQuery.branchId,
      user,
    );
    const promotions = [
      ...promotionContext.promotions,
      ...promotionContext.happyHours,
    ]
      .filter((promotion) => promotion.discountType !== 'FIXED_PRICE')
      .slice(0, query.limit);
    const translationContext = await this.loadTranslationContext(
      resolvedQuery.restaurantId,
      resolvedQuery.locale,
      this.collectPromotionTranslationRefs(promotions),
    );

    return {
      data: await Promise.all(
        promotions.map((promotion) =>
          this.mapPublicPromotion(promotion, undefined, translationContext),
        ),
      ),
      message: 'Promotions fetched successfully',
    };
  }

  async listCoupons(
    query: ListCustomerPromotionsQueryDto,
    user?: AuthUserContext,
  ) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    await this.getPublicContent(resolvedQuery, user);
    const coupons =
      (await this.couponsService?.getActiveCustomerCoupons(
        resolvedQuery.restaurantId,
        resolvedQuery.branchId,
        this.isGuestAudience(user),
      )) ?? [];
    const pageItems = coupons.slice(0, query.limit);
    const translationContext = await this.loadTranslationContext(
      resolvedQuery.restaurantId,
      resolvedQuery.locale,
      this.collectPromotionTranslationRefs(pageItems),
    );

    return {
      data: await Promise.all(
        pageItems.map((coupon) =>
          this.mapPublicCoupon(coupon, translationContext),
        ),
      ),
      message: 'Coupons fetched successfully',
    };
  }

  async listDeals(
    query: ListCustomerPromotionsQueryDto,
    user?: AuthUserContext,
  ) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    await this.getPublicContent(resolvedQuery, user);
    const deals = (
      (await this.couponsService?.getActiveCustomerDeals(
        resolvedQuery.restaurantId,
        resolvedQuery.branchId,
        this.isGuestAudience(user),
      )) ?? []
    )
      .filter((promotion) => !this.isPromotionUsageLimitReached(promotion))
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.createdAt.getTime() - right.createdAt.getTime(),
      )
      .slice(0, query.limit);
    const scopedMenuItemsById = await this.loadDealScopeMenuItems(
      resolvedQuery,
      deals,
    );
    const translationContext = await this.loadTranslationContext(
      resolvedQuery.restaurantId,
      resolvedQuery.locale,
      this.collectPromotionTranslationRefs(deals),
    );

    return {
      data: await Promise.all(
        deals.map((promotion) =>
          this.mapPublicPromotion(
            promotion,
            scopedMenuItemsById,
            translationContext,
          ),
        ),
      ),
      message: 'Deals fetched successfully',
    };
  }

  async getItemBySlug(
    slug: string,
    query: PublicMenuItemBySlugQueryDto,
    user?: AuthUserContext,
  ) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    const normalizedSlug = slug.trim();
    const item = await this.customerAppRepository.findPublicMenuItemBySlug(
      normalizedSlug,
      resolvedQuery,
    );

    if (!item) {
      throw new NotFoundException('Menu item not found');
    }

    if (!this.isMenuItemAvailableForCurrentSchedule(item)) {
      throw new NotFoundException('Menu item not found');
    }

    const promotionContext = await this.loadPromotionContext(
      resolvedQuery.restaurantId,
      resolvedQuery.branchId,
      user,
    );
    const translationContext = await this.loadTranslationContext(
      resolvedQuery.restaurantId,
      resolvedQuery.locale,
      this.collectMenuItemTranslationRefs(item),
    );

    const mappedItem = await this.mapMenuItem(
      item,
      promotionContext.promotions,
      promotionContext.happyHours,
      translationContext,
    );

    return {
      data: {
        ...mappedItem,
        modifierGroups: this.mapItemModifierGroups(item, translationContext),
      },
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
      user,
    );
    const [cuisines, promotionalItems, faqs] = await Promise.all([
      this.customerAppRepository.listCuisineCategories(
        {
          ...resolvedQuery,
          page: 1,
          limit: query.cuisineLimit,
          sortBy: 'sortOrder',
          sortOrder: 'ASC',
        },
        { includeItems: false },
      ),
      promotionContext.menuItemIds.length ||
      promotionContext.categoryIds.length ||
      promotionContext.hasBroadHappyHour
        ? this.customerAppRepository.listPromotionalItems(resolvedQuery, {
            menuItemIds: promotionContext.hasBroadHappyHour
              ? []
              : promotionContext.menuItemIds,
            categoryIds: promotionContext.hasBroadHappyHour
              ? []
              : promotionContext.categoryIds,
            includeDetails: false,
          })
        : Promise.resolve([]),
      this.getFaqs(resolvedQuery, user),
    ]);
    const visiblePromotionalItems =
      this.filterAvailableMenuItems(promotionalItems);
    const translationContext = await this.loadTranslationContext(
      resolvedQuery.restaurantId,
      resolvedQuery.locale,
      [
        { entityType: 'RESTAURANT', entityId: restaurant.id },
        ...(branch
          ? [{ entityType: 'BRANCH' as const, entityId: branch.id }]
          : []),
        ...this.collectCuisineTranslationRefs(cuisines.items),
        ...visiblePromotionalItems.flatMap((item) =>
          this.collectMenuItemTranslationRefs(item),
        ),
      ],
    );
    const translatedRestaurant = this.applyEntityTranslation(
      'RESTAURANT',
      restaurant.id,
      restaurant,
      translationContext,
    );
    const translatedBranch = branch
      ? this.applyEntityTranslation(
          'BRANCH',
          branch.id,
          branch,
          translationContext,
        )
      : null;
    const [restaurantAddress, branchAddress] = await Promise.all([
      this.customerAppRepository.findPublicAddress(
        translatedRestaurant.id,
        AddressRefType.RESTAURANT,
      ),
      translatedBranch
        ? this.customerAppRepository.findPublicAddress(
            translatedBranch.id,
            AddressRefType.BRANCH,
          )
        : Promise.resolve(null),
    ]);
    const restaurantContactInfo = this.readRestaurantContactInfo(
      restaurant.supportContact,
      restaurant.settings,
    );
    const branchContactInfo = translatedBranch
      ? this.readBranchContactInfo(
          translatedBranch.settings,
          restaurantContactInfo,
        )
      : null;
    const [currency, timezone, platformMethodsResponse, activeBranchCount] =
      await Promise.all([
        this.resolveHomeCurrency(restaurant.settings),
        this.resolveHomeTimezone(),
        this.globalSettingsService?.getPaymentMethods(),
        this.customerAppRepository.countActiveBranches(restaurant.id),
      ]);
    const activePlatformMethods = platformMethodsResponse
      ? platformMethodsResponse.data
          .filter((method) => method.isActive)
          .map((method) => method.code)
      : null;
    const [
      restaurantLogoUrl,
      restaurantCoverImage,
      branchLogoUrl,
      branchCoverImage,
    ] = await Promise.all([
      this.resolveMediaUrl(translatedRestaurant.logoUrl),
      this.resolveMediaUrl(translatedRestaurant.coverImage),
      this.resolveMediaUrl(translatedBranch?.logoUrl ?? null),
      this.resolveMediaUrl(translatedBranch?.coverImage ?? null),
    ]);
    const storefrontLogoUrl = branchLogoUrl ?? restaurantLogoUrl;
    const storefrontContactInfo = branchContactInfo ?? restaurantContactInfo;
    const restaurantPublicAddress = this.mapPublicAddress(
      restaurantAddress,
      'shopNumber',
    );
    const branchPublicAddress = this.mapPublicAddress(
      branchAddress,
      'shopNumber',
    );
    const footer = {
      logoUrl: storefrontLogoUrl,
      restaurantLogoUrl,
      branchLogoUrl,
      contactInfo: storefrontContactInfo,
      contacts: storefrontContactInfo,
      phone: storefrontContactInfo.phone,
      whatsapp: storefrontContactInfo.whatsapp,
      email: storefrontContactInfo.email,
      address: branchPublicAddress ?? restaurantPublicAddress,
      socialMediaLinks: this.extractSocialMediaLinks(
        translatedRestaurant.socialMedia,
        restaurant.settings,
      ),
    };

    return {
      data: {
        restaurant: {
          id: translatedRestaurant.id,
          name: translatedRestaurant.name,
          logoUrl: restaurantLogoUrl,
          restaurantLogoUrl,
          storefrontLogoUrl,
          businessLogo: null,
          coverImage: restaurantCoverImage,
          tagline: translatedRestaurant.tagline,
          bio: translatedRestaurant.bio,
          socialMediaLinks: this.extractSocialMediaLinks(
            translatedRestaurant.socialMedia,
            restaurant.settings,
          ),
          contactInfo: restaurantContactInfo,
          phone: restaurantContactInfo.phone,
          whatsapp: restaurantContactInfo.whatsapp,
          email: restaurantContactInfo.email,
          contacts: restaurantContactInfo,
          address: restaurantPublicAddress,
        },
        contactInfo: storefrontContactInfo,
        contacts: storefrontContactInfo,
        footer,
        logoUrl: storefrontLogoUrl,
        restaurantLogoUrl,
        storefrontLogoUrl,
        businessLogo: null,
        config: {
          currency,
          timezone,
          branding: this.asObject(restaurant.branding),
        },
        branch: translatedBranch
          ? {
              id: translatedBranch.id,
              name: translatedBranch.name,
              logoUrl: branchLogoUrl,
              restaurantLogoUrl,
              storefrontLogoUrl,
              businessLogo: null,
              coverImage: branchCoverImage,
              description: translatedBranch.description,
              contactInfo: branchContactInfo,
              phone: branchContactInfo?.phone ?? null,
              whatsapp: branchContactInfo?.whatsapp ?? null,
              email: branchContactInfo?.email ?? null,
              contacts: branchContactInfo,
              address: branchPublicAddress,
              isOpen: this.isBranchOpenNow(translatedBranch.settings),
              isOnlyBranch: activeBranchCount === 1,
              settings: {
                allowedOrderTypes: this.readStringArrayValue(
                  translatedBranch.settings,
                  [['allowedOrderTypes']],
                ),
                allowedPaymentMethods: resolveAvailablePaymentMethods({
                  platformMethods: activePlatformMethods,
                  restaurantSettings: restaurant.settings,
                  branchSettings: translatedBranch.settings,
                }),
              },
              scheduleTimings: {
                timezone,
                openingHours: this.readBranchScheduleHours(
                  translatedBranch.settings,
                  'openingHours',
                ),
                deliveryHours: this.readBranchScheduleHours(
                  translatedBranch.settings,
                  'deliveryHours',
                ),
                holidayOpeningHours: this.readBranchHolidayOpeningHours(
                  translatedBranch.settings,
                ),
                deliveryIntervalMinutes: this.readOptionalNumberValue(
                  translatedBranch.settings,
                  [['deliveryIntervalMinutes'], ['deliveryTimeInterval']],
                ),
                pickupIntervalMinutes: this.readOptionalNumberValue(
                  translatedBranch.settings,
                  [['pickupIntervalMinutes'], ['pickupTimeInterval']],
                ),
              },
              tableReservationsEnabled: this.readBooleanValue(
                translatedBranch.settings,
                [['tableReservationsEnabled']],
              ),
            }
          : null,
        landingPopup: branch
          ? this.resolveBranchClosedPeriodPopup(branch.settings)
          : null,
        cuisines: await Promise.all(
          cuisines.items.map((item) =>
            this.mapCuisineCategory(
              item,
              promotionContext.promotions,
              promotionContext.happyHours,
              translationContext,
            ),
          ),
        ),
        promotionalItems: await Promise.all(
          visiblePromotionalItems.map((item) =>
            this.mapHomeMenuItemCard(
              item,
              promotionContext.promotions,
              promotionContext.happyHours,
              translationContext,
            ),
          ),
        ),
        faqs: faqs.data.items,
        giftCards: this.isGiftCardsEnabled(restaurant.settings)
          ? {
              isEnabled: true,
              items: await this.mapPublicGiftCards(
                await this.customerAppRepository.listPublicGiftCards(
                  restaurant.id,
                  branch?.id,
                ),
              ),
            }
          : null,
      },
      message: 'Home screen fetched successfully',
    };
  }

  async getBranchStats(
    query: PublicBranchStatsQueryDto,
    user?: AuthUserContext,
  ) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    if (!resolvedQuery.branchId) {
      throw new BadRequestException('branchId is required');
    }

    const { restaurant, branch } = await this.getPublicContent(
      resolvedQuery,
      user,
    );
    const stats = await this.customerAppRepository.getBranchPublicStats(
      restaurant.id,
      branch!.id,
    );

    return {
      data: {
        restaurantId: restaurant.id,
        branchId: branch!.id,
        branchName: branch!.name,
        ...stats,
      },
      message: 'Branch stats fetched successfully',
    };
  }

  async listPublicReviews(
    query: ListPublicOrderReviewsQueryDto,
    user?: AuthUserContext,
  ) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    if (resolvedQuery.branchId) {
      await this.getPublicContent(resolvedQuery, user);
    } else {
      const restaurant =
        await this.customerAppRepository.findRestaurantPublicContent(
          resolvedQuery.restaurantId,
        );
      if (!restaurant) {
        throw new NotFoundException('Restaurant not found');
      }
    }

    const { items, total, summary } =
      await this.customerAppRepository.listPublicReviews(resolvedQuery);

    return {
      data: {
        items,
        summary,
      },
      message: 'Order reviews fetched successfully',
      meta: buildPaginationMeta(query, total),
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

  async redeemGiftCard(
    user: AuthUserContext,
    dto: RedeemGiftCardDto,
    requestedCustomerId?: string,
  ) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);
    const data = await this.loyaltyWalletService!.redeemGiftCardToWallet(
      {
        customerId: customer.id,
        tenantId: customer.tenantId!,
        restaurantId: customer.restaurantId!,
        branchId: dto.branchId ?? customer.branchId ?? undefined,
      },
      dto.code,
      user.uid,
    );

    return {
      data,
      message: 'Gift card redeemed successfully',
    };
  }

  async listGiftCards(
    user: AuthUserContext,
    query: ListCustomerGiftCardsQueryDto,
    requestedCustomerId?: string,
  ) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);
    const result = await this.loyaltyWalletService!.listPurchasedGiftCards(
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
      message: 'Gift cards fetched successfully',
      meta: buildPaginationMeta(query, result.total),
    };
  }

  async purchaseGiftCard(
    user: AuthUserContext,
    dto: PurchaseGiftCardDto,
    requestedCustomerId?: string,
  ) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);
    const data = await this.loyaltyWalletService!.purchaseGiftCardFromWallet(
      {
        customerId: customer.id,
        tenantId: customer.tenantId!,
        restaurantId: customer.restaurantId!,
        branchId: dto.branchId ?? customer.branchId ?? undefined,
      },
      dto,
      user.uid,
    );

    return {
      data,
      message: 'Gift card purchased successfully',
    };
  }

  async listPublicGiftCards(
    query: ListPublicGiftCardsQueryDto,
    user?: AuthUserContext,
  ) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    const { restaurant, branch } = await this.getPublicContent(
      resolvedQuery,
      user,
    );

    if (!this.isGiftCardsEnabled(restaurant.settings)) {
      return {
        data: {
          isEnabled: false,
          items: [],
        },
        message: 'Gift cards are not enabled',
      };
    }

    return {
      data: {
        isEnabled: true,
        items: await this.mapPublicGiftCards(
          await this.customerAppRepository.listPublicGiftCards(
            restaurant.id,
            branch?.id,
          ),
        ),
      },
      message: 'Gift cards fetched successfully',
    };
  }

  async guestPurchaseGiftCard(
    query: PublicRestaurantQueryDto,
    dto: GuestPurchaseGiftCardDto,
    user?: AuthUserContext,
  ) {
    const resolvedQuery = this.resolvePublicRestaurantQuery(query, user);
    const { restaurant, branch } = await this.getPublicContent(
      resolvedQuery,
      user,
    );

    if (!this.isGiftCardsEnabled(restaurant.settings)) {
      throw new BadRequestException('Gift cards are not enabled');
    }

    const data = await this.paymentsService!.createGuestGiftCardPurchaseAttempt(
      {
        tenantId: restaurant.tenantId,
        restaurantId: restaurant.id,
        branchId: dto.branchId ?? branch?.id,
      },
      dto,
    );

    return {
      data,
      message: 'Gift card purchase payment intent created successfully',
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
            this.toReservationBranchPublic(
              branchMap.get(reservation.branchId) ?? null,
            ),
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
            this.toReservationBranchPublic(
              branchMap.get(reservation.branchId) ?? null,
            ),
          ),
        })),
    );

    return {
      data,
      message: 'Table reservations fetched successfully',
      meta: buildPaginationMeta(query, reservations.length),
    };
  }

  async updateAdminTableReservationStatus(
    user: AuthUserContext,
    reservationId: string,
    dto: UpdateTableReservationStatusDto,
  ) {
    if (user.role === UserRoleEnum.CUSTOMER) {
      throw new ForbiddenException(
        'Customers cannot update reservation status',
      );
    }

    const restaurantId = await this.resolveAdminReservationRestaurantId(
      user,
      dto.restaurantId,
    );
    const branchId = this.resolveAdminReservationBranchId(user, dto.branchId);
    const customers =
      await this.customerAppRepository.findCustomersForTableReservations({
        restaurantId,
        customerId: dto.customerId,
      });

    for (const customer of customers) {
      const existingReservations = this.readTableReservations(
        customer.profile?.metadata,
      );
      const reservation = existingReservations.find(
        (item) => item.id === reservationId,
      );

      if (!reservation) {
        continue;
      }

      if (branchId && reservation.branchId !== branchId) {
        throw new NotFoundException('Table reservation not found');
      }

      if (dto.status === 'CONFIRMED') {
        const branches =
          await this.customerAppRepository.findBranchesPublicContent(
            [reservation.branchId],
            restaurantId,
          );
        const reservationBranch = branches.find(
          (item) => item.id === reservation.branchId,
        );
        await this.assertTableReservationCapacityAvailable({
          restaurantId,
          branchId: reservation.branchId,
          branchSettings: reservationBranch?.settings,
          reservationDate: reservation.reservationDate,
          excludeReservationId: reservation.id,
        });
      }

      const cancelledAt =
        dto.status === 'CANCELLED'
          ? (reservation.cancelledAt ?? new Date().toISOString())
          : null;
      const reservations = existingReservations.map((item) =>
        item.id === reservationId
          ? { ...item, status: dto.status, cancelledAt }
          : item,
      );
      const updatedReservation =
        reservations.find((item) => item.id === reservationId) ?? null;
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

      const branches = updatedReservation
        ? await this.customerAppRepository.findBranchesPublicContent(
            [updatedReservation.branchId],
            restaurantId,
          )
        : [];
      const branch = updatedReservation
        ? branches.find((item) => item.id === updatedReservation.branchId)
        : null;

      if (dto.status === 'CONFIRMED' && updatedReservation && branch) {
        await this.notifyTableReservationAdmin({
          branch,
          customer: {
            id: customer.id,
            email: customer.email,
            firstName: customer.profile?.firstName ?? null,
            lastName: customer.profile?.lastName ?? null,
          },
          reservation: updatedReservation,
        });
      }

      if (updatedReservation && branch) {
        await this.notifyTableReservationCustomer({
          branch,
          customer: {
            id: customer.id,
          },
          reservation: updatedReservation,
          source: 'STATUS_UPDATED',
        });
      }

      return {
        data: updatedReservation
          ? {
              ...updatedReservation,
              customer: {
                id: customer.id,
                email: customer.email,
                firstName: customer.profile?.firstName ?? null,
                lastName: customer.profile?.lastName ?? null,
                phone: customer.profile?.phone ?? null,
                avatarUrl: customer.profile?.avatarUrl ?? null,
              },
              branch: await this.resolveBranchMedia(
                this.toReservationBranchPublic(branch ?? null),
              ),
            }
          : null,
        message: 'Table reservation status updated successfully',
      };
    }

    throw new NotFoundException('Table reservation not found');
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

    const autoAccept = this.readBooleanValue(branch.settings, [
      ['tableReservationAutoAccept'],
      ['tableReservations', 'autoAccept'],
    ]);
    const canAutoAccept =
      autoAccept &&
      (await this.hasTableReservationCapacityAvailable({
        restaurantId: customer.restaurantId,
        branchId: branch.id,
        branchSettings: branch.settings,
        reservationDate: reservationDate.toISOString(),
      }));

    const existingReservations = this.readTableReservations(
      customer.profile?.metadata,
    );
    const reservation: TableReservationRecord = {
      id: randomUUID(),
      branchId: dto.branchId,
      reservationDate: reservationDate.toISOString(),
      guestCount: dto.guestCount,
      note: dto.note?.trim() || null,
      status: canAutoAccept ? 'CONFIRMED' : 'REQUESTED',
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

    await this.notifyTableReservationAdmin({
      branch,
      customer: {
        id: customer.id,
        email: customer.email,
        firstName: customer.profile?.firstName ?? null,
        lastName: customer.profile?.lastName ?? null,
      },
      reservation,
    });

    await this.notifyTableReservationCustomer({
      branch,
      customer: {
        id: customer.id,
      },
      reservation,
      source: 'CREATED',
    });

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

  private normalizeDomainHost(value: string) {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return '';
    }

    try {
      const url = trimmed.includes('://')
        ? new URL(trimmed)
        : new URL(`https://${trimmed}`);
      return url.hostname.replace(/^www\./, '');
    } catch {
      return trimmed
        .split('/')[0]
        .split(':')[0]
        .replace(/^www\./, '');
    }
  }

  private extractRestaurantSubdomain(hostname: string, baseDomain: string) {
    if (!hostname || !baseDomain || hostname === baseDomain) {
      return undefined;
    }

    const suffix = `.${baseDomain}`;
    if (!hostname.endsWith(suffix)) {
      return undefined;
    }

    const candidate = hostname.slice(0, -suffix.length);
    return candidate && !candidate.includes('.') ? candidate : undefined;
  }

  private async loadTranslationContext(
    restaurantId: string,
    localeParam: string | null | undefined,
    refs: EntityTranslationRef[],
  ): Promise<CustomerAppTranslationContext | undefined> {
    const locale = normalizeLocale(localeParam);
    if (
      locale === DEFAULT_LOCALE ||
      !this.localizationsService ||
      !refs.length
    ) {
      return undefined;
    }

    const translations = await this.localizationsService.findActiveTranslations(
      restaurantId,
      locale,
      refs,
    );

    return {
      locale,
      fieldsByKey: new Map(
        translations.map((translation) => [
          this.translationKey(translation.entityType, translation.entityId),
          translation.fields,
        ]),
      ),
    };
  }

  private applyEntityTranslation<T extends object>(
    entityType: LocalizationEntityType,
    entityId: string,
    source: T,
    context?: CustomerAppTranslationContext,
  ): T {
    const fields = context?.fieldsByKey.get(
      this.translationKey(entityType, entityId),
    );

    if (!fields) {
      return source;
    }

    return {
      ...source,
      ...Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== null),
      ),
    };
  }

  private translationKey(entityType: LocalizationEntityType, entityId: string) {
    return `${entityType}:${entityId}`;
  }

  private collectMenuCategoryTranslationRefs(
    categories: Array<{
      id: string;
      items?: unknown[];
    }>,
  ): EntityTranslationRef[] {
    return categories.flatMap((category) => [
      { entityType: 'MENU_CATEGORY', entityId: category.id },
      ...(
        (category.items ?? []) as Array<
          Parameters<CustomerAppService['collectMenuItemTranslationRefs']>[0]
        >
      ).flatMap((item) => this.collectMenuItemTranslationRefs(item)),
    ]);
  }

  private collectCuisineTranslationRefs(
    cuisines: Array<{
      id: string;
      items?: unknown[];
    }>,
  ): EntityTranslationRef[] {
    return cuisines.flatMap((cuisine) => [
      { entityType: 'CUISINE', entityId: cuisine.id },
      ...(
        (cuisine.items ?? []) as Array<
          Parameters<CustomerAppService['collectMenuItemTranslationRefs']>[0]
        >
      ).flatMap((item) => this.collectMenuItemTranslationRefs(item)),
    ]);
  }

  private collectPromotionTranslationRefs(
    promotions: AutoApplyPromotion[],
  ): EntityTranslationRef[] {
    return promotions.flatMap((promotion) => [
      { entityType: 'COUPON', entityId: promotion.id },
      ...this.mergePromotionScopeEntities(
        promotion.scopeMenuItem,
        (promotion.scopeMenuItems ?? []).map((entry) => entry.menuItem),
      ).map((item) => ({
        entityType: 'MENU_ITEM' as const,
        entityId: item.id,
      })),
      ...this.mergePromotionScopeEntities(
        promotion.scopeCategory,
        (promotion.scopeCategories ?? []).map((entry) => entry.menuCategory),
      ).map((category) => ({
        entityType: 'MENU_CATEGORY' as const,
        entityId: category.id,
      })),
    ]);
  }

  private collectMenuItemTranslationRefs(item: {
    id: string;
    restaurant?: { id: string } | null;
    category?: {
      id: string;
      modifierLinks?: Array<{
        modifierGroup: {
          id: string;
          modifierLinks: Array<{
            modifier: { id: string };
          }>;
        };
      }>;
    } | null;
    variations?: Array<{ id: string }>;
    variationPriceOverrides?: Array<{
      variation?: { id: string } | null;
    }>;
    modifierLinks?: Array<{
      modifierGroup: {
        id: string;
        modifierLinks: Array<{
          modifier: { id: string };
        }>;
      };
    }>;
    modifierPriceOverrides?: Array<{
      modifier?: { id: string } | null;
    }>;
  }): EntityTranslationRef[] {
    const refs: EntityTranslationRef[] = [
      { entityType: 'MENU_ITEM', entityId: item.id },
    ];

    if (item.restaurant?.id) {
      refs.push({ entityType: 'RESTAURANT', entityId: item.restaurant.id });
    }

    if (item.category?.id) {
      refs.push({ entityType: 'MENU_CATEGORY', entityId: item.category.id });
    }

    for (const variation of item.variations ?? []) {
      refs.push({
        entityType: 'MENU_ITEM_VARIATION',
        entityId: variation.id,
      });
    }

    for (const override of item.variationPriceOverrides ?? []) {
      if (override.variation?.id) {
        refs.push({
          entityType: 'MENU_ITEM_VARIATION',
          entityId: override.variation.id,
        });
      }
    }

    const modifierGroupLinks = [
      ...(item.modifierLinks ?? []),
      ...(item.category?.modifierLinks ?? []),
    ];

    for (const groupLink of modifierGroupLinks) {
      refs.push({
        entityType: 'MODIFIER_GROUP',
        entityId: groupLink.modifierGroup.id,
      });

      for (const modifierLink of groupLink.modifierGroup.modifierLinks) {
        refs.push({
          entityType: 'MODIFIER',
          entityId: modifierLink.modifier.id,
        });
      }
    }

    for (const override of item.modifierPriceOverrides ?? []) {
      if (override.modifier?.id) {
        refs.push({ entityType: 'MODIFIER', entityId: override.modifier.id });
      }
    }

    return refs;
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

      return {
        ...customer,
        tenantId: customer.tenantId ?? user.tid ?? null,
        restaurantId: customer.restaurantId ?? user.rid ?? null,
        branchId: customer.branchId ?? user.bid ?? null,
      };
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

  private async assertTableReservationCapacityAvailable(input: {
    restaurantId: string;
    branchId: string;
    branchSettings: Prisma.JsonValue | null | undefined;
    reservationDate: string;
    excludeReservationId?: string;
  }) {
    if (!(await this.hasTableReservationCapacityAvailable(input))) {
      throw new BadRequestException(
        'No tables are available for this reservation time',
      );
    }
  }

  private async hasTableReservationCapacityAvailable(input: {
    restaurantId: string;
    branchId: string;
    branchSettings: Prisma.JsonValue | null | undefined;
    reservationDate: string;
    excludeReservationId?: string;
  }) {
    const tableCount = this.readNumberValue(input.branchSettings, [
      ['tableCount'],
      ['tableReservations', 'tableCount'],
    ]);

    if (tableCount <= 0) {
      return false;
    }

    const customers =
      await this.customerAppRepository.findCustomersForTableReservations({
        restaurantId: input.restaurantId,
      });
    const acceptedReservations = customers.flatMap((customer) =>
      this.readTableReservations(customer.profile?.metadata).filter(
        (reservation) =>
          reservation.id !== input.excludeReservationId &&
          reservation.branchId === input.branchId &&
          reservation.reservationDate === input.reservationDate &&
          ['CONFIRMED', 'SEATED'].includes(reservation.status),
      ),
    );

    return acceptedReservations.length < tableCount;
  }

  private async notifyTableReservationAdmin(input: {
    branch: {
      id: string;
      tenantId: string;
      restaurantId: string;
      name: string;
    };
    customer: {
      id: string;
      email: string;
      firstName?: string | null;
      lastName?: string | null;
    };
    reservation: TableReservationRecord;
  }) {
    if (!this.notificationsService) {
      return;
    }

    const customerName = [input.customer.firstName, input.customer.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    await this.notificationsService.notifyTableReservationAdmin({
      tenantId: input.branch.tenantId,
      restaurantId: input.branch.restaurantId,
      branchId: input.branch.id,
      branchName: input.branch.name,
      reservationId: input.reservation.id,
      customerId: input.customer.id,
      customerEmail: input.customer.email,
      customerName: customerName || null,
      reservationDate: input.reservation.reservationDate,
      guestCount: input.reservation.guestCount,
      status:
        input.reservation.status === 'CONFIRMED' ? 'CONFIRMED' : 'REQUESTED',
    });
  }

  private async notifyTableReservationCustomer(input: {
    branch: {
      id: string;
      tenantId: string;
      restaurantId: string;
      name: string;
    };
    customer: {
      id: string;
    };
    reservation: TableReservationRecord;
    source: 'CREATED' | 'STATUS_UPDATED';
  }) {
    if (!this.notificationsService) {
      return;
    }

    await this.notificationsService.notifyTableReservationCustomer({
      tenantId: input.branch.tenantId,
      restaurantId: input.branch.restaurantId,
      branchId: input.branch.id,
      branchName: input.branch.name,
      reservationId: input.reservation.id,
      customerId: input.customer.id,
      reservationDate: input.reservation.reservationDate,
      guestCount: input.reservation.guestCount,
      status: input.reservation.status,
      source: input.source,
    });
  }

  private toReservationBranchPublic(
    branch: {
      id: string;
      name: string;
      logoUrl?: string | null;
      coverImage?: string | null;
      description?: string | null;
    } | null,
  ) {
    if (!branch) {
      return null;
    }

    return {
      id: branch.id,
      name: branch.name,
      logoUrl: branch.logoUrl ?? null,
      coverImage: branch.coverImage ?? null,
      description: branch.description ?? null,
    };
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

        const status =
          typeof reservation.status === 'string' &&
          TABLE_RESERVATION_STATUS_VALUES.includes(
            reservation.status as TableReservationStatus,
          )
            ? (reservation.status as TableReservationStatus)
            : 'REQUESTED';

        return {
          id: reservation.id,
          branchId: reservation.branchId,
          reservationDate: reservation.reservationDate,
          guestCount: reservation.guestCount,
          note: typeof reservation.note === 'string' ? reservation.note : null,
          status,
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

  private filterAvailableMenuItems<T extends PublicMenuItemScheduleCarrier>(
    items: T[],
  ): T[] {
    return items.filter((item) =>
      this.isMenuItemAvailableForCurrentSchedule(item),
    );
  }

  private isMenuItemAvailableForCurrentSchedule(
    item: PublicMenuItemScheduleCarrier,
  ): boolean {
    const links = [
      ...(item.menuLinks ?? []),
      ...(item.category?.menuLinks ?? []),
      ...(item.categoryLinks ?? []).flatMap(
        (link) => link.menuCategory?.menuLinks ?? [],
      ),
    ];

    if (!links.length) {
      return true;
    }

    const now = new Date();
    return links.some((link) => {
      if (link.isActive === false || !link.restaurantMenu) {
        return false;
      }

      if (!link.restaurantMenu.isActive || link.restaurantMenu.deletedAt) {
        return false;
      }

      if (!link.restaurantMenu.isTimed) {
        return true;
      }

      return isRestaurantMenuAvailableAt(link.restaurantMenu.timingConfig, now);
    });
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
      isRequired?: boolean | null;
      minSelect?: number | null;
      maxSelect?: number | null;
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
        modifierLinks?: PublicMenuItemModifierGroupLink[];
        menuLinks?: PublicRestaurantMenuScheduleLink[];
      };
      categoryLinks?: Array<{
        menuCategoryId: string;
        menuCategory?: {
          menuLinks?: PublicRestaurantMenuScheduleLink[];
        } | null;
      }>;
      menuLinks?: PublicRestaurantMenuScheduleLink[];
      variations?: PublicMenuItemVariation[];
      variationPriceOverrides?: PublicMenuItemVariationOverride[];
      modifierPriceOverrides?: Array<{
        menuItemId?: string | null;
        modifierId?: string;
        priceDelta: Prisma.Decimal;
        isRequired?: boolean;
        modifier: PublicMenuItemModifier;
      }>;
      modifierLinks?: PublicMenuItemModifierGroupLink[];
      branchOverrides?: Array<{
        priceOverride: Prisma.Decimal | null;
        isAvailable: boolean;
      }>;
    },
    promotions: Array<Record<string, unknown>> = [],
    happyHours: Array<Record<string, unknown>> = [],
    translationContext?: CustomerAppTranslationContext,
  ) {
    const translatedItem = this.applyEntityTranslation(
      'MENU_ITEM',
      item.id,
      item,
      translationContext,
    );
    const translatedRestaurant = item.restaurant
      ? this.applyEntityTranslation(
          'RESTAURANT',
          item.restaurant.id,
          item.restaurant,
          translationContext,
        )
      : null;
    const translatedCategory = item.category
      ? this.applyEntityTranslation(
          'MENU_CATEGORY',
          item.category.id,
          item.category,
          translationContext,
        )
      : null;
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
      this.itemCategoryIds(item),
      effectiveBasePrice,
      promotions,
    );
    const itemHappyHour = this.resolveBestScopedItemHappyHour(
      item.id,
      this.itemCategoryIds(item),
      effectiveBasePrice,
      happyHours,
    );
    const normalizedVariations = this.normalizeVariations(
      variations,
      item.id,
    ).map((variation) => {
      const translatedVariation = this.applyEntityTranslation(
        'MENU_ITEM_VARIATION',
        variation.id,
        variation,
        translationContext,
      );
      const variationPromotion = this.resolveBestScopedItemPromotion(
        item.id,
        this.itemCategoryIds(item),
        translatedVariation.price,
        promotions,
      );
      const variationHappyHour = this.resolveBestScopedItemHappyHour(
        item.id,
        this.itemCategoryIds(item),
        translatedVariation.price,
        happyHours,
      );

      return {
        ...translatedVariation,
        discountedPrice: variationPromotion?.discountedAmount ?? null,
        promotion: variationPromotion ?? null,
        happyHourDiscountedPrice: variationHappyHour?.discountedPrice ?? null,
        happyHour: variationHappyHour ?? null,
      };
    });

    return {
      id: item.id,
      restaurantId: item.restaurant?.id ?? '',
      name: translatedItem.name,
      slug: item.slug,
      description: translatedItem.description,
      ingredients: translatedItem.ingredients,
      nutritionalInformation: translatedItem.nutritionalInformation,
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
      happyHourDiscountedBasePrice: itemHappyHour?.discountedPrice ?? null,
      happyHour: itemHappyHour ?? null,
      depositAmount: item.depositAmount ? Number(item.depositAmount) : null,
      prepTimeMinutes: item.prepTimeMinutes,
      isRequired: item.isRequired ?? false,
      minSelect: item.isRequired ? (item.minSelect ?? 1) : 0,
      maxSelect: item.isRequired ? (item.maxSelect ?? null) : 1,
      restaurant: translatedRestaurant
        ? {
            id: translatedRestaurant.id,
            name: translatedRestaurant.name,
            logoUrl: await this.resolveMediaUrl(translatedRestaurant.logoUrl),
            tagline: translatedRestaurant.tagline ?? null,
          }
        : null,
      category: translatedCategory
        ? {
            id: translatedCategory.id,
            name: translatedCategory.name,
            imageUrl: await this.resolveMediaUrl(translatedCategory.imageUrl),
          }
        : null,
      variations: normalizedVariations,
      modifierPriceOverrides: item.modifierPriceOverrides ?? [],
      modifiers: this.mapItemModifiers(item, translationContext),
      isAvailable: branchOverride?.isAvailable ?? true,
    };
  }

  private async mapHomeMenuItemCard(
    item: Parameters<CustomerAppService['mapMenuItem']>[0],
    promotions: Array<Record<string, unknown>> = [],
    happyHours: Array<Record<string, unknown>> = [],
    translationContext?: CustomerAppTranslationContext,
  ) {
    const translatedItem = this.applyEntityTranslation(
      'MENU_ITEM',
      item.id,
      item,
      translationContext,
    );
    const translatedCategory = item.category
      ? this.applyEntityTranslation(
          'MENU_CATEGORY',
          item.category.id,
          item.category,
          translationContext,
        )
      : null;
    const branchOverride = item.branchOverrides?.[0];
    const effectiveBasePrice = branchOverride?.priceOverride ?? item.basePrice;
    const dietaryFlags = this.readStringArray(item.dietaryFlags).filter(
      (flag) => flag !== '__SPLIT_PIZZA_ENABLED__',
    );
    const settings =
      item.restaurant?.tenant?.settings ?? item.restaurant?.settings;
    const itemPromotion = this.resolveBestScopedItemPromotion(
      item.id,
      this.itemCategoryIds(item),
      effectiveBasePrice,
      promotions,
    );
    const itemHappyHour = this.resolveBestScopedItemHappyHour(
      item.id,
      this.itemCategoryIds(item),
      effectiveBasePrice,
      happyHours,
    );
    const variations = this.normalizeVariations(
      this.resolvePublicItemVariations(item),
      item.id,
    ).map((variation) => {
      const translatedVariation = this.applyEntityTranslation(
        'MENU_ITEM_VARIATION',
        variation.id,
        variation,
        translationContext,
      );
      const variationPromotion = this.resolveBestScopedItemPromotion(
        item.id,
        this.itemCategoryIds(item),
        translatedVariation.price,
        promotions,
      );
      const variationHappyHour = this.resolveBestScopedItemHappyHour(
        item.id,
        this.itemCategoryIds(item),
        translatedVariation.price,
        happyHours,
      );

      return {
        id: translatedVariation.id,
        name: translatedVariation.name,
        description: translatedVariation.description,
        price: translatedVariation.price,
        pickupPrice: translatedVariation.pickupPrice ?? null,
        displayText: translatedVariation.displayText ?? null,
        sortOrder: translatedVariation.sortOrder ?? 0,
        isDefault: translatedVariation.isDefault,
        isActive: translatedVariation.isActive ?? true,
        discountedPrice: variationPromotion?.discountedAmount ?? null,
        promotion: variationPromotion ?? null,
        happyHourDiscountedPrice: variationHappyHour?.discountedPrice ?? null,
        happyHour: variationHappyHour ?? null,
      };
    });

    return {
      id: item.id,
      restaurantId: item.restaurant?.id ?? '',
      name: translatedItem.name,
      slug: item.slug,
      description: translatedItem.description,
      imageUrl: await this.resolveMediaUrl(item.imageUrl),
      basePrice: effectiveBasePrice,
      discountedBasePrice: itemPromotion?.discountedAmount ?? null,
      promotion: itemPromotion ?? null,
      happyHourDiscountedBasePrice: itemHappyHour?.discountedPrice ?? null,
      happyHour: itemHappyHour ?? null,
      prepTimeMinutes: item.prepTimeMinutes,
      dietaryFlags,
      labels: dietaryFlags,
      productLabels: this.resolveProductLabels(dietaryFlags, settings),
      category: translatedCategory
        ? {
            id: translatedCategory.id,
            name: translatedCategory.name,
            imageUrl: await this.resolveMediaUrl(translatedCategory.imageUrl),
          }
        : null,
      variations,
      isActive: true,
      isAvailable: branchOverride?.isAvailable ?? true,
    };
  }

  private mapItemModifiers(
    item: {
      id: string;
      isRequired?: boolean | null;
      modifierLinks?: Array<{
        modifierGroup: {
          modifierLinks: Array<{
            sortOrder: number;
            modifier: {
              id: string;
              name: string;
              priceDelta: Prisma.Decimal;
              sortOrder?: number;
              itemPriceOverrides?: Array<{
                menuItemId: string;
                priceDelta: Prisma.Decimal;
              }>;
            };
          }>;
        };
      }>;
      modifierPriceOverrides?: Array<{
        menuItemId?: string | null;
        modifierId?: string;
        priceDelta: Prisma.Decimal;
        isRequired?: boolean;
        modifier: PublicMenuItemModifier;
      }>;
    },
    translationContext?: CustomerAppTranslationContext,
  ) {
    const modifierById = new Map<
      string,
      {
        id: string;
        name: string;
        sortOrder: number;
        priceDelta: number;
        isRequired: boolean;
      }
    >();

    const priceOverrides = item.modifierPriceOverrides ?? [];

    for (const groupLink of item.modifierLinks ?? []) {
      for (const modifierLink of groupLink.modifierGroup.modifierLinks) {
        const modifier = modifierLink.modifier;
        const priceOverride = priceOverrides.find(
          (override) =>
            override.modifierId === modifier.id ||
            override.modifier.id === modifier.id,
        );
        const itemPriceOverride = modifier.itemPriceOverrides?.find(
          (override) => override.menuItemId === item.id,
        );

        const translatedModifier = this.applyEntityTranslation(
          'MODIFIER',
          modifier.id,
          modifier,
          translationContext,
        );

        modifierById.set(modifier.id, {
          id: modifier.id,
          name: translatedModifier.name,
          sortOrder: modifier.sortOrder ?? modifierLink.sortOrder,
          priceDelta: Number(
            priceOverride?.priceDelta ??
              itemPriceOverride?.priceDelta ??
              modifier.priceDelta,
          ),
          isRequired: priceOverride?.isRequired ?? false,
        });
      }
    }

    for (const override of priceOverrides) {
      if (modifierById.has(override.modifier.id)) {
        continue;
      }

      const translatedModifier = this.applyEntityTranslation(
        'MODIFIER',
        override.modifier.id,
        override.modifier,
        translationContext,
      );

      modifierById.set(override.modifier.id, {
        id: override.modifier.id,
        name: translatedModifier.name,
        sortOrder: override.modifier.sortOrder,
        priceDelta: Number(override.priceDelta),
        isRequired: override.isRequired ?? false,
      });
    }

    return Array.from(modifierById.values()).sort(
      (left, right) => left.sortOrder - right.sortOrder,
    );
  }

  private mapItemModifierGroups(
    item: Parameters<CustomerAppService['mapMenuItem']>[0],
    translationContext?: CustomerAppTranslationContext,
  ) {
    const groupsById = new Map<
      string,
      {
        id: string;
        name: string;
        description: string | null;
        selectionType: ModifierSelectionType;
        minSelect: number;
        maxSelect: number;
        isRequired: boolean;
        sortOrder: number;
        isActive: boolean;
        modifiers: Array<{
          id: string;
          name: string;
          priceDelta: number;
          sortOrder: number;
          isActive: boolean;
        }>;
      }
    >();
    const priceOverrides = item.modifierPriceOverrides ?? [];
    const links = [
      ...(item.modifierLinks ?? []),
      ...(item.category?.modifierLinks ?? []),
    ];

    for (const link of links) {
      const group = link.modifierGroup;

      if (!group.isActive || groupsById.has(group.id)) {
        continue;
      }

      const translatedGroup = this.applyEntityTranslation(
        'MODIFIER_GROUP',
        group.id,
        group,
        translationContext,
      );
      const minSelect = link.minSelect ?? group.minSelect;
      const maxSelect = link.maxSelect ?? group.maxSelect;
      const modifiers = group.modifierLinks
        .filter(({ modifier }) => modifier.isActive !== false)
        .map(({ modifier, sortOrder }) => {
          const translatedModifier = this.applyEntityTranslation(
            'MODIFIER',
            modifier.id,
            modifier,
            translationContext,
          );
          const priceOverride = priceOverrides.find(
            (override) =>
              override.modifierId === modifier.id ||
              override.modifier.id === modifier.id,
          );
          const itemPriceOverride = modifier.itemPriceOverrides?.find(
            (override) => override.menuItemId === item.id,
          );

          return {
            id: modifier.id,
            name: translatedModifier.name,
            priceDelta: Number(
              priceOverride?.priceDelta ??
                itemPriceOverride?.priceDelta ??
                modifier.priceDelta,
            ),
            sortOrder: modifier.sortOrder ?? sortOrder,
            isActive: true,
          };
        })
        .sort((left, right) => left.sortOrder - right.sortOrder);

      if (!modifiers.length) {
        continue;
      }

      groupsById.set(group.id, {
        id: group.id,
        name: translatedGroup.name,
        description: translatedGroup.description ?? null,
        selectionType: link.selectionType,
        minSelect,
        maxSelect,
        isRequired: minSelect > 0,
        sortOrder: link.sortOrder,
        isActive: true,
        modifiers,
      });
    }

    return Array.from(groupsById.values()).sort(
      (left, right) => left.sortOrder - right.sortOrder,
    );
  }

  private async mapMenuCategory(
    item: {
      id: string;
      name: string;
      slug: string;
      description?: string | null;
      imageUrl?: string | null;
      sortOrder?: number;
      _count: { items: number };
      items?: unknown[];
      categoryIds?: string[];
    },
    promotions: Array<Record<string, unknown>> = [],
    happyHours: Array<Record<string, unknown>> = [],
    translationContext?: CustomerAppTranslationContext,
  ) {
    const translatedItem = this.applyEntityTranslation(
      'MENU_CATEGORY',
      item.id,
      item,
      translationContext,
    );
    const visibleItems = this.filterAvailableMenuItems(
      (item.items ?? []) as PublicMenuItemScheduleCarrier[],
    );

    return {
      id: item.id,
      name: translatedItem.name,
      slug: item.slug,
      description: translatedItem.description ?? null,
      imageUrl: await this.resolveMediaUrl(item.imageUrl),
      sortOrder: item.sortOrder,
      itemCount: item.items ? visibleItems.length : item._count.items,
      ...(item.items
        ? {
            items: await Promise.all(
              visibleItems.map((menuItem) =>
                this.mapMenuItem(
                  menuItem as Parameters<CustomerAppService['mapMenuItem']>[0],
                  promotions,
                  happyHours,
                  translationContext,
                ),
              ),
            ),
          }
        : {}),
      promotion: this.resolveBestCategoryPromotion(
        item.categoryIds ?? [item.id],
        promotions,
      ),
      happyHour: this.resolveBestCategoryHappyHour(
        item.categoryIds ?? [item.id],
        happyHours,
      ),
    };
  }

  private async mapCuisineCategory(
    item: {
      id: string;
      name: string;
      slug: string;
      description?: string | null;
      imageUrl?: string | null;
      sortOrder?: number;
      _count: { items: number };
      items?: unknown[];
      categoryIds?: string[];
    },
    promotions: Array<Record<string, unknown>> = [],
    happyHours: Array<Record<string, unknown>> = [],
    translationContext?: CustomerAppTranslationContext,
  ) {
    const translatedItem = this.applyEntityTranslation(
      'CUISINE',
      item.id,
      item,
      translationContext,
    );
    const visibleItems = this.filterAvailableMenuItems(
      (item.items ?? []) as PublicMenuItemScheduleCarrier[],
    );

    return {
      id: item.id,
      name: translatedItem.name,
      slug: item.slug,
      description: translatedItem.description ?? null,
      imageUrl: await this.resolveMediaUrl(item.imageUrl),
      sortOrder: item.sortOrder,
      itemCount: item.items ? visibleItems.length : item._count.items,
      ...(item.items
        ? {
            items: await Promise.all(
              visibleItems.map((menuItem) =>
                this.mapMenuItem(
                  menuItem as Parameters<CustomerAppService['mapMenuItem']>[0],
                  promotions,
                  happyHours,
                  translationContext,
                ),
              ),
            ),
          }
        : {}),
      promotion: this.resolveBestCategoryPromotion(
        item.categoryIds ?? [],
        promotions,
      ),
      happyHour: this.resolveBestCategoryHappyHour(
        item.categoryIds ?? [],
        happyHours,
      ),
    };
  }

  private resolveBestCategoryPromotion(
    categoryIds: string[],
    promotions: Array<Record<string, unknown>>,
  ) {
    const categoryIdSet = new Set(categoryIds);
    const matched = promotions.find((promotion) => {
      if ((promotion.applyMode as string) !== 'SCOPED_ITEMS') {
        return false;
      }

      const scopedCategoryIds = this.collectPromotionScopeIds(
        (promotion.scopeCategory as { id?: string } | null | undefined)?.id ??
          null,
        (
          (promotion.scopeCategories as Array<{
            menuCategory: { id: string };
          }>) ?? []
        ).map((entry) => entry.menuCategory.id),
      );

      return scopedCategoryIds.some((categoryId) =>
        categoryIdSet.has(categoryId),
      );
    });

    if (!matched) {
      return null;
    }

    return {
      promotionId: matched.id,
      title: matched.title,
      description: matched.description ?? null,
      applyMode: matched.applyMode,
      discountType: matched.discountType,
      discountValue: Number(matched.discountValue),
      maxDiscountAmount:
        matched.maxDiscountAmount instanceof Prisma.Decimal
          ? Number(matched.maxDiscountAmount)
          : (matched.maxDiscountAmount ?? null),
    };
  }

  private resolveBestCategoryHappyHour(
    categoryIds: string[],
    happyHours: Array<Record<string, unknown>>,
  ) {
    const categoryIdSet = new Set(categoryIds);
    const matched = happyHours.find((happyHour) => {
      if ((happyHour.applyMode as string) !== 'SCOPED_ITEMS') {
        return false;
      }

      const scopedCategoryIds = this.collectPromotionScopeIds(
        (happyHour.scopeCategory as { id?: string } | null | undefined)?.id ??
          null,
        (
          (happyHour.scopeCategories as Array<{
            menuCategory: { id: string };
          }>) ?? []
        ).map((entry) => entry.menuCategory.id),
      );

      return (
        !scopedCategoryIds.length ||
        scopedCategoryIds.some((categoryId) => categoryIdSet.has(categoryId))
      );
    });

    if (!matched) {
      return null;
    }

    return this.buildCategoryHappyHourSummary(matched);
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

  private isGuestAudience(user?: AuthUserContext) {
    return !user || user.isGuest === true;
  }

  private async loadPromotionContext(
    restaurantId: string,
    branchId?: string,
    user?: AuthUserContext,
  ) {
    const customerIsGuest = this.isGuestAudience(user);
    const [rawPromotions, rawHappyHours]: [
      AutoApplyPromotion[],
      ActiveHappyHour[],
    ] = await Promise.all([
      this.couponsService?.getActiveAutoApplyPromotions(
        restaurantId,
        branchId,
        customerIsGuest,
      ) ?? Promise.resolve([]),
      this.couponsService?.getActiveHappyHours(
        restaurantId,
        branchId,
        customerIsGuest,
      ) ?? Promise.resolve([]),
    ]);
    const promotions = rawPromotions.filter(
      (promotion) => !this.isPromotionUsageLimitReached(promotion),
    );
    const happyHours = rawHappyHours.filter(
      (happyHour) => !this.isPromotionUsageLimitReached(happyHour),
    );
    const menuItemIds = new Set<string>();
    const categoryIds = new Set<string>();
    let hasBroadHappyHour = false;

    for (const promotion of [...promotions, ...happyHours]) {
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

      if (
        promotion.kind === 'HAPPY_HOUR' &&
        !scopedMenuItemIds.length &&
        !scopedCategoryIds.length
      ) {
        hasBroadHappyHour = true;
      }
    }

    return {
      promotions,
      happyHours,
      menuItemIds: [...menuItemIds],
      categoryIds: [...categoryIds],
      hasBroadHappyHour,
    };
  }

  private isPromotionUsageLimitReached(promotion: {
    maxUses?: number | null;
    usedCount?: number | null;
  }) {
    return (
      promotion.maxUses !== null &&
      promotion.maxUses !== undefined &&
      (promotion.usedCount ?? 0) >= promotion.maxUses
    );
  }

  private async mapPublicPromotion(
    promotion: AutoApplyPromotion,
    scopedMenuItemsById?: Map<string, PublicDealScopeMenuItem>,
    translationContext?: CustomerAppTranslationContext,
  ) {
    const imageUrl = await this.resolveMediaUrl(promotion.imageUrl);
    const translatedPromotion = this.applyEntityTranslation(
      'COUPON',
      promotion.id,
      promotion,
      translationContext,
    );

    return {
      id: promotion.id,
      title: translatedPromotion.title,
      description: translatedPromotion.description,
      imageUrl,
      thumbnailUrl: imageUrl,
      audience: promotion.audience,
      applyMode: promotion.applyMode,
      discountType: promotion.discountType,
      discountValue: Number(promotion.discountValue),
      dealSelectionMode:
        promotion.dealSelectionMode ?? CouponDealSelectionMode.FIXED_ITEMS,
      maxDiscountAmount: promotion.maxDiscountAmount
        ? Number(promotion.maxDiscountAmount)
        : null,
      minOrderAmount: promotion.minOrderAmount
        ? Number(promotion.minOrderAmount)
        : null,
      startsAt: promotion.startsAt,
      expiresAt: promotion.expiresAt,
      branch: promotion.branch
        ? {
            id: promotion.branch.id,
            name: promotion.branch.name,
            logoUrl: await this.resolveMediaUrl(promotion.branch.logoUrl),
            coverImage: await this.resolveMediaUrl(promotion.branch.coverImage),
          }
        : null,
      restaurant: promotion.restaurant
        ? {
            id: promotion.restaurant.id,
            name: promotion.restaurant.name,
            slug: promotion.restaurant.slug,
            logoUrl: await this.resolveMediaUrl(promotion.restaurant.logoUrl),
            coverImage: await this.resolveMediaUrl(
              promotion.restaurant.coverImage,
            ),
          }
        : null,
      scopeMenuItems: await this.mapPublicPromotionScopeMenuItems(
        promotion,
        scopedMenuItemsById,
        translationContext,
      ),
      scopeCategories: await Promise.all(
        this.mergePromotionScopeEntities(
          promotion.scopeCategory,
          (promotion.scopeCategories ?? []).map((entry) => entry.menuCategory),
        ).map((category) =>
          this.mapPromotionScopeEntity(category, translationContext),
        ),
      ),
      scopeCategoryRules:
        promotion.scopeCategories?.map((entry) => {
          const eligibility = this.resolvePromotionCategoryRuleEligibility(
            entry.menuCategory,
            entry.forcedVariationId ?? null,
          );
          const includedMenuItemIds = this.readStringArrayJson(
            entry.includedMenuItemIds,
          );
          const configuredExcludedMenuItemIds = this.readStringArrayJson(
            entry.excludedMenuItemIds,
          );
          const eligibleMenuItemIds = (
            includedMenuItemIds.length
              ? eligibility.eligibleMenuItemIds.filter((id) =>
                  includedMenuItemIds.includes(id),
                )
              : eligibility.eligibleMenuItemIds
          ).filter((id) => !configuredExcludedMenuItemIds.includes(id));

          return {
            menuCategoryId: entry.menuCategory.id,
            itemLimit: entry.itemLimit ?? null,
            variationId: entry.forcedVariationId ?? null,
            variation: entry.forcedVariation ?? null,
            eligibleMenuItemIds,
            excludedMenuItemIds: [
              ...new Set([
                ...eligibility.excludedMenuItemIds,
                ...configuredExcludedMenuItemIds,
                ...eligibility.eligibleMenuItemIds.filter(
                  (id) =>
                    includedMenuItemIds.length &&
                    !eligibleMenuItemIds.includes(id),
                ),
              ]),
            ],
          };
        }) ?? [],
    };
  }

  private resolvePromotionCategoryRuleEligibility(
    menuCategory: {
      id: string;
      variations?: Array<{ id: string }>;
      variationLinks?: Array<{ variationId: string }>;
      items?: Array<{
        id: string;
        variationPriceOverrides?: Array<{ variationId: string }>;
      }>;
    },
    forcedVariationId: string | null,
  ) {
    const allMenuItemIds = menuCategory.items?.map((item) => item.id) ?? [];

    if (!forcedVariationId) {
      return { eligibleMenuItemIds: allMenuItemIds, excludedMenuItemIds: [] };
    }

    const hasCategoryWideVariation =
      menuCategory.variations?.some(
        (variation) => variation.id === forcedVariationId,
      ) ||
      menuCategory.variationLinks?.some(
        (link) => link.variationId === forcedVariationId,
      );

    if (hasCategoryWideVariation) {
      return { eligibleMenuItemIds: allMenuItemIds, excludedMenuItemIds: [] };
    }

    const eligibleMenuItemIds =
      menuCategory.items
        ?.filter((item) =>
          item.variationPriceOverrides?.some(
            (override) => override.variationId === forcedVariationId,
          ),
        )
        .map((item) => item.id) ?? [];

    return {
      eligibleMenuItemIds,
      excludedMenuItemIds: allMenuItemIds.filter(
        (menuItemId) => !eligibleMenuItemIds.includes(menuItemId),
      ),
    };
  }

  private readStringArrayJson(value: Prisma.JsonValue | null | undefined) {
    if (!Array.isArray(value)) {
      return [];
    }

    return [
      ...new Set(
        value.filter(
          (entry): entry is string =>
            typeof entry === 'string' && entry.trim().length > 0,
        ),
      ),
    ];
  }

  private async mapPublicCoupon(
    coupon: CustomerCoupon,
    translationContext?: CustomerAppTranslationContext,
  ) {
    const imageUrl = await this.resolveMediaUrl(coupon.imageUrl);
    const translatedCoupon = this.applyEntityTranslation(
      'COUPON',
      coupon.id,
      coupon,
      translationContext,
    );

    return {
      id: coupon.id,
      code: coupon.code,
      title: translatedCoupon.title,
      description: translatedCoupon.description,
      imageUrl,
      thumbnailUrl: imageUrl,
      audience: coupon.audience,
      applyMode: coupon.applyMode,
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
      maxDiscountAmount: coupon.maxDiscountAmount
        ? Number(coupon.maxDiscountAmount)
        : null,
      minOrderAmount: coupon.minOrderAmount
        ? Number(coupon.minOrderAmount)
        : null,
      maxUses: coupon.maxUses,
      maxUsesPerCustomer: coupon.maxUsesPerCustomer,
      usedCount: coupon.usedCount,
      startsAt: coupon.startsAt,
      expiresAt: coupon.expiresAt,
      branch: coupon.branch
        ? {
            id: coupon.branch.id,
            name: coupon.branch.name,
            logoUrl: await this.resolveMediaUrl(coupon.branch.logoUrl),
            coverImage: await this.resolveMediaUrl(coupon.branch.coverImage),
          }
        : null,
      restaurant: coupon.restaurant
        ? {
            id: coupon.restaurant.id,
            name: coupon.restaurant.name,
            slug: coupon.restaurant.slug,
            logoUrl: await this.resolveMediaUrl(coupon.restaurant.logoUrl),
            coverImage: await this.resolveMediaUrl(
              coupon.restaurant.coverImage,
            ),
          }
        : null,
    };
  }

  private async loadDealScopeMenuItems(
    query: PublicRestaurantQueryDto,
    deals: AutoApplyPromotion[],
  ) {
    const menuItemIds = [
      ...new Set(
        deals.flatMap((deal) =>
          this.collectPromotionScopeIds(
            deal.scopeMenuItem?.id ?? null,
            (deal.scopeMenuItems ?? []).map((entry) => entry.menuItem.id),
          ),
        ),
      ),
    ];

    if (!menuItemIds.length) {
      return new Map<string, PublicDealScopeMenuItem>();
    }

    if (!query.restaurantId) {
      return new Map<string, PublicDealScopeMenuItem>();
    }

    const items = await this.customerAppRepository.listPublicDealScopeMenuItems(
      {
        restaurantId: query.restaurantId,
        branchId: query.branchId,
      },
      menuItemIds,
    );
    const publicItems = items as unknown as Array<
      Parameters<CustomerAppService['mapMenuItem']>[0]
    >;
    const mappedItems = await Promise.all(
      this.filterAvailableMenuItems(publicItems).map((item) =>
        this.mapReadyMadeDealScopeMenuItem(item),
      ),
    );

    return new Map<string, PublicDealScopeMenuItem>(
      mappedItems.map((item) => [item.id, item]),
    );
  }

  private async mapPublicPromotionScopeMenuItems(
    promotion: AutoApplyPromotion,
    scopedMenuItemsById?: Map<string, PublicDealScopeMenuItem>,
    translationContext?: CustomerAppTranslationContext,
  ) {
    const scopeItems = this.mergePromotionScopeEntities(
      promotion.scopeMenuItem,
      (promotion.scopeMenuItems ?? []).map((entry) => entry.menuItem),
    );

    if (scopedMenuItemsById) {
      return scopeItems
        .map((item) => scopedMenuItemsById.get(item.id))
        .filter((item): item is PublicDealScopeMenuItem => Boolean(item));
    }

    return Promise.all(
      scopeItems.map((item) =>
        this.mapPromotionScopeEntity(item, translationContext),
      ),
    );
  }

  private async mapReadyMadeDealScopeMenuItem(
    item: Parameters<CustomerAppService['mapMenuItem']>[0],
  ) {
    const mappedItem = await this.mapMenuItem(item, []);
    const modifierGroups = this.mapItemModifierGroups(item);

    return {
      id: mappedItem.id,
      name: mappedItem.name,
      slug: mappedItem.slug,
      description: mappedItem.description,
      imageUrl: mappedItem.imageUrl,
      basePrice: Number(mappedItem.basePrice),
      depositAmount: mappedItem.depositAmount,
      prepTimeMinutes: mappedItem.prepTimeMinutes,
      category: mappedItem.category
        ? {
            id: mappedItem.category.id,
            name: mappedItem.category.name,
            imageUrl: mappedItem.category.imageUrl,
          }
        : null,
      variations: mappedItem.variations,
      modifierGroups,
      modifiers: mappedItem.modifiers,
      supportsSplitPizza: this.readStringArray(item.dietaryFlags).includes(
        '__SPLIT_PIZZA_ENABLED__',
      ),
      isRequired: mappedItem.isRequired,
      minSelect: mappedItem.minSelect,
      maxSelect: mappedItem.maxSelect,
      hasConfigurableOptions:
        mappedItem.variations.length > 0 || modifierGroups.length > 0,
      requiresCustomization:
        mappedItem.isRequired ||
        modifierGroups.some((group) => (Number(group.minSelect) || 0) > 0),
      supportsDealIdCartPayload: true,
      supportsDealCartPayload: true,
      isDealMenuItem: true,
    };
  }

  private async mapPromotionScopeEntity(
    entity: PublicPromotionScopeEntity,
    translationContext?: CustomerAppTranslationContext,
  ) {
    const translatedEntity = this.applyEntityTranslation(
      entity.basePrice !== undefined ? 'MENU_ITEM' : 'MENU_CATEGORY',
      entity.id,
      entity,
      translationContext,
    );

    return {
      id: translatedEntity.id,
      name: translatedEntity.name,
      ...(translatedEntity.slug !== undefined
        ? { slug: translatedEntity.slug }
        : {}),
      imageUrl: await this.resolveMediaUrl(translatedEntity.imageUrl),
      ...(translatedEntity.basePrice !== undefined
        ? { basePrice: Number(translatedEntity.basePrice) }
        : {}),
    };
  }

  private mergePromotionScopeEntities<T extends PublicPromotionScopeEntity>(
    primary: T | null | undefined,
    extras: T[],
  ) {
    const items = [...(primary ? [primary] : []), ...extras];
    return items.filter(
      (item, index, all) =>
        all.findIndex((entry) => entry.id === item.id) === index,
    );
  }

  private itemCategoryIds(item: {
    category?: { id: string } | null;
    categoryLinks?: Array<{ menuCategoryId: string }>;
  }) {
    return [
      ...(item.category?.id ? [item.category.id] : []),
      ...(item.categoryLinks ?? []).map((link) => link.menuCategoryId),
    ];
  }

  private resolveBestScopedItemPromotion(
    menuItemId: string,
    categoryIds: string[],
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

      if (
        (promotion.discountType as string) === 'FIXED_PRICE' &&
        scopedMenuItemIds.length > 1
      ) {
        continue;
      }

      const matches =
        (!scopedMenuItemIds.length && !scopedCategoryIds.length) ||
        scopedMenuItemIds.includes(menuItemId) ||
        categoryIds.some((categoryId) =>
          scopedCategoryIds.includes(categoryId),
        );

      if (!matches) {
        continue;
      }

      const preview = this.buildScopedPromotionPreview(
        promotion as {
          id: string;
          title: string;
          description: string | null;
          imageUrl?: string | null;
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

  private resolveBestScopedItemHappyHour(
    menuItemId: string,
    categoryIds: string[],
    baseAmount: Prisma.Decimal,
    happyHours: Array<Record<string, unknown>>,
  ) {
    let best: ReturnType<CustomerAppService['buildHappyHourPreview']> | null =
      null;

    for (const happyHour of happyHours) {
      if ((happyHour.applyMode as string) !== 'SCOPED_ITEMS') {
        continue;
      }

      const scopedMenuItemIds = this.collectPromotionScopeIds(
        (happyHour.scopeMenuItem as { id?: string } | null | undefined)?.id ??
          null,
        (
          (happyHour.scopeMenuItems as Array<{ menuItem: { id: string } }>) ??
          []
        ).map((entry) => entry.menuItem.id),
      );
      const scopedCategoryIds = this.collectPromotionScopeIds(
        (happyHour.scopeCategory as { id?: string } | null | undefined)?.id ??
          null,
        (
          (happyHour.scopeCategories as Array<{
            menuCategory: { id: string };
          }>) ?? []
        ).map((entry) => entry.menuCategory.id),
      );
      const matches =
        (!scopedMenuItemIds.length && !scopedCategoryIds.length) ||
        scopedMenuItemIds.includes(menuItemId) ||
        categoryIds.some((categoryId) =>
          scopedCategoryIds.includes(categoryId),
        );

      if (!matches) {
        continue;
      }

      const preview = this.buildHappyHourPreview(
        happyHour as {
          id: string;
          title: string;
          description: string | null;
          imageUrl?: string | null;
          applyMode: string;
          discountType: string;
          discountValue: Prisma.Decimal;
          maxDiscountAmount: Prisma.Decimal | null;
          startsAt?: Date | null;
          expiresAt?: Date | null;
          activeDays?: Prisma.JsonValue | null;
          dailyStartTime?: string | null;
          dailyEndTime?: string | null;
        },
        baseAmount,
      );

      if (!best || preview.discountAmount > best.discountAmount) {
        best = preview;
      }
    }

    return best;
  }

  private buildCategoryHappyHourSummary(happyHour: Record<string, unknown>) {
    return {
      id: happyHour.id,
      title: happyHour.title,
      description: (happyHour.description as string | null | undefined) ?? null,
      imageUrl: (happyHour.imageUrl as string | null | undefined) ?? null,
      thumbnailUrl: (happyHour.imageUrl as string | null | undefined) ?? null,
      applyMode: happyHour.applyMode,
      discountType: happyHour.discountType,
      discountValue: Number(happyHour.discountValue),
      maxDiscountAmount:
        happyHour.maxDiscountAmount instanceof Prisma.Decimal
          ? Number(happyHour.maxDiscountAmount)
          : ((happyHour.maxDiscountAmount as number | null | undefined) ??
            null),
      startsAt: (happyHour.startsAt as Date | null | undefined) ?? null,
      expiresAt: (happyHour.expiresAt as Date | null | undefined) ?? null,
      activeDays: this.readNumberArray(happyHour.activeDays),
      dailyStartTime:
        (happyHour.dailyStartTime as string | null | undefined) ?? null,
      dailyEndTime:
        (happyHour.dailyEndTime as string | null | undefined) ?? null,
      isCurrentlyActive: true,
    };
  }

  private buildHappyHourPreview(
    happyHour: {
      id: string;
      title: string;
      description: string | null;
      imageUrl?: string | null;
      applyMode: string;
      discountType: string;
      discountValue: Prisma.Decimal;
      maxDiscountAmount: Prisma.Decimal | null;
      startsAt?: Date | null;
      expiresAt?: Date | null;
      activeDays?: Prisma.JsonValue | null;
      dailyStartTime?: string | null;
      dailyEndTime?: string | null;
    },
    baseAmount: Prisma.Decimal,
  ) {
    const preview = this.buildScopedPromotionPreview(happyHour, baseAmount);

    return {
      id: happyHour.id,
      title: happyHour.title,
      description: happyHour.description,
      imageUrl: happyHour.imageUrl ?? null,
      thumbnailUrl: happyHour.imageUrl ?? null,
      applyMode: preview.applyMode,
      discountType: preview.discountType,
      discountValue: preview.discountValue,
      maxDiscountAmount: preview.maxDiscountAmount,
      originalPrice: Number(baseAmount),
      discountAmount: preview.discountAmount,
      discountedPrice: preview.discountedAmount,
      startsAt: happyHour.startsAt ?? null,
      expiresAt: happyHour.expiresAt ?? null,
      activeDays: this.readNumberArray(happyHour.activeDays),
      dailyStartTime: happyHour.dailyStartTime ?? null,
      dailyEndTime: happyHour.dailyEndTime ?? null,
      isCurrentlyActive: true,
    };
  }

  private buildScopedPromotionPreview(
    promotion: {
      id: string;
      title: string;
      description: string | null;
      imageUrl?: string | null;
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

    if (promotion.discountType === 'FIXED_PRICE') {
      discountAmount = Prisma.Decimal.max(
        amount.minus(promotion.discountValue),
        new Prisma.Decimal(0),
      );
    } else if (promotion.discountType === 'FLAT') {
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
      imageUrl: promotion.imageUrl ?? null,
      thumbnailUrl: promotion.imageUrl ?? null,
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

  private async mapPublicGiftCards(
    giftCards: Array<{
      id: string;
      branchId: string | null;
      title: string;
      description: string | null;
      imageUrl: string | null;
      discountValue: Prisma.Decimal;
      expiresAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>,
  ) {
    return Promise.all(
      giftCards.map(async (giftCard) => ({
        id: giftCard.id,
        branchId: giftCard.branchId,
        title: giftCard.title,
        description: giftCard.description,
        imageUrl: await this.resolveMediaUrl(giftCard.imageUrl),
        amount: Number(giftCard.discountValue),
        expiresAt: giftCard.expiresAt,
        createdAt: giftCard.createdAt,
        updatedAt: giftCard.updatedAt,
      })),
    );
  }

  private isGiftCardsEnabled(settings: unknown) {
    return this.readBooleanValue(settings, [
      ['giftCards', 'isEnabled'],
      ['customerApp', 'giftCards', 'isEnabled'],
      ['customerApp', 'giftCardsEnabled'],
      ['giftCardsEnabled'],
    ]);
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

  private readNumberArray(input: unknown): number[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input.filter((value): value is number => Number.isInteger(value));
  }

  private readRestaurantContactInfo(
    supportContact: unknown,
    restaurantSettings: unknown,
  ) {
    return {
      phone:
        this.readStringValue(supportContact, [
          ['phone'],
          ['phoneNumber'],
          ['contactPhone'],
          ['contactNumber'],
          ['mobile'],
        ]) ??
        this.readStringValue(restaurantSettings, [
          ['contact', 'phone'],
          ['contact', 'phoneNumber'],
          ['contact', 'contactPhone'],
          ['contact', 'contactNumber'],
          ['contact', 'mobile'],
        ]),
      whatsapp:
        this.readStringValue(supportContact, [['whatsapp']]) ??
        this.readStringValue(restaurantSettings, [['contact', 'whatsapp']]),
      email:
        this.readStringValue(supportContact, [
          ['email'],
          ['contactEmail'],
          ['supportEmail'],
        ]) ??
        this.readStringValue(restaurantSettings, [
          ['contact', 'email'],
          ['contact', 'contactEmail'],
          ['contact', 'supportEmail'],
        ]),
    };
  }

  private readBranchContactInfo(
    branchSettings: unknown,
    restaurantContactInfo: {
      phone: string | null;
      whatsapp: string | null;
      email: string | null;
    },
  ) {
    return {
      phone:
        this.readStringValue(branchSettings, [
          ['contact', 'phone'],
          ['contact', 'phoneNumber'],
          ['contact', 'contactPhone'],
          ['contact', 'contactNumber'],
          ['contact', 'mobile'],
        ]) ?? restaurantContactInfo.phone,
      whatsapp:
        this.readStringValue(branchSettings, [['contact', 'whatsapp']]) ??
        restaurantContactInfo.whatsapp,
      email:
        this.readStringValue(branchSettings, [
          ['contact', 'email'],
          ['contact', 'contactEmail'],
          ['contact', 'supportEmail'],
        ]) ?? restaurantContactInfo.email,
    };
  }

  private mapPublicAddress(
    address: {
      street: string;
      area: string | null;
      postalCode: string | null;
      city: string;
      state: string;
      country: string;
      lat: Prisma.Decimal | null;
      lng: Prisma.Decimal | null;
    } | null,
    labelKey: 'houseNumber' | 'shopNumber',
  ) {
    if (!address) {
      return null;
    }

    return {
      street: address.street,
      [labelKey]: address.area,
      area: address.area,
      postalCode: address.postalCode,
      city: address.city,
      state: address.state,
      country: address.country,
      addressLines: [
        [address.street, address.area].filter(Boolean).join(' - '),
        [address.postalCode, address.city].filter(Boolean).join(' - '),
      ].filter((line) => line.length > 0),
      lat: address.lat ? Number(address.lat) : null,
      lng: address.lng ? Number(address.lng) : null,
    };
  }

  private isBranchOpenNow(settings: unknown) {
    const hours = this.readBranchScheduleHours(settings, 'openingHours');
    if (!hours.length) {
      return true;
    }

    const local = this.getKarachiLocalNow();
    const today = hours.find(
      (entry) =>
        this.readStringValue(entry, [['dayOfWeek']]) === local.dayOfWeek,
    );

    if (
      !today ||
      this.readBooleanValue(today, [['isClosed']]) ||
      !this.readStringValue(today, [['openTime']]) ||
      !this.readStringValue(today, [['closeTime']])
    ) {
      return false;
    }

    const openMinutes = this.parseTimeMinutes(
      this.readStringValue(today, [['openTime']]),
    );
    const closeMinutes = this.parseTimeMinutes(
      this.readStringValue(today, [['closeTime']]),
    );

    if (openMinutes === null || closeMinutes === null) {
      return false;
    }

    return openMinutes <= closeMinutes
      ? local.minutes >= openMinutes && local.minutes < closeMinutes
      : local.minutes >= openMinutes || local.minutes < closeMinutes;
  }

  private getKarachiLocalNow() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Karachi',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const read = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? '';
    return {
      dayOfWeek: read('weekday').toUpperCase(),
      minutes: Number(read('hour')) * 60 + Number(read('minute')),
    };
  }

  private parseTimeMinutes(value: string | null) {
    if (!value) {
      return null;
    }

    const [hour, minute] = value.split(':').map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }

    return hour * 60 + minute;
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

  private readStringArrayValue(source: unknown, paths: string[][]): string[] {
    for (const path of paths) {
      const value = this.readPath(source, path);
      if (Array.isArray(value)) {
        return value.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        );
      }
    }

    return [];
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

  private readOptionalNumberValue(
    source: unknown,
    paths: string[][],
  ): number | null {
    for (const path of paths) {
      const value = this.readPath(source, path);
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
    }

    return null;
  }

  private readBranchScheduleHours(
    source: unknown,
    key: 'openingHours' | 'deliveryHours',
  ): unknown[] {
    const value = this.readPath(source, [key]);
    if (Array.isArray(value) && value.length) {
      return Array.from(value as unknown[]);
    }

    if (key === 'deliveryHours') {
      return this.readBranchScheduleHours(source, 'openingHours');
    }

    return [];
  }

  private readBranchHolidayOpeningHours(source: unknown): unknown[] {
    const value = this.readPath(source, ['holidayOpeningHours']);
    return Array.isArray(value) ? Array.from(value as unknown[]) : [];
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

  private async resolveHomeCurrency(settings: unknown): Promise<string | null> {
    return (
      (await this.globalSettingsService?.getDefaultCurrencyCode()) ??
      this.readRestaurantCurrency(settings)
    );
  }

  private async resolveHomeTimezone(): Promise<string | null> {
    const timezone = (await this.globalSettingsService?.getSettings())?.data
      ?.timezone;

    return typeof timezone === 'string' && timezone.trim().length
      ? timezone.trim()
      : null;
  }

  private extractLegalProfile(settings: unknown) {
    const legalProfile = this.asObject(
      this.readPath(settings, ['legalProfile']),
    );
    const billing = this.asObject(this.readPath(settings, ['billing']));
    const invoice = this.asObject(this.readPath(settings, ['invoice']));
    const legalAddress = this.asObject(legalProfile.businessAddress);
    const billingAddress = this.asObject(billing.businessAddress);
    const invoiceAddress = this.asObject(invoice.businessAddress);
    const businessAddress = this.normalizeBusinessAddress({
      ...invoiceAddress,
      ...billingAddress,
      ...legalAddress,
    });

    return {
      ownerName:
        this.readStringValue(settings, [
          ['legalProfile', 'ownerName'],
          ['billing', 'ownerName'],
          ['invoice', 'ownerName'],
          ['ownerName'],
        ]) ?? null,
      legalBusinessName:
        this.readStringValue(settings, [
          ['legalProfile', 'legalBusinessName'],
          ['billing', 'legalBusinessName'],
          ['invoice', 'legalBusinessName'],
          ['legalBusinessName'],
          ['legalName'],
        ]) ?? null,
      taxNumber:
        this.readStringValue(settings, [
          ['legalProfile', 'taxNumber'],
          ['billing', 'taxNumber'],
          ['billing', 'vatNumber'],
          ['invoice', 'taxNumber'],
          ['invoice', 'vatNumber'],
          ['taxNumber'],
          ['vatNumber'],
        ]) ?? null,
      businessAddress:
        Object.keys(businessAddress).length > 0 ? businessAddress : null,
      contractText:
        this.readStringValue(settings, [
          ['legalProfile', 'contractText'],
          ['customerApp', 'contractText'],
          ['publicContent', 'contractText'],
          ['contractText'],
        ]) ?? null,
    };
  }

  private normalizeBusinessAddress(address: Record<string, unknown>) {
    if (Object.keys(address).length === 0) {
      return address;
    }

    const shopNumber = this.readStringValue(address, [
      ['shopNumber'],
      ['houseNumber'],
      ['area'],
      ['addressLine2'],
      ['line2'],
    ]);

    return {
      ...address,
      shopNumber: shopNumber ?? null,
    };
  }

  private extractSocialMediaLinks(
    socialMedia: unknown,
    settings: unknown,
  ): Record<string, unknown> {
    const direct = this.asObject(socialMedia);
    const fromSettings = {
      ...this.asObject(this.readPath(settings, ['socialMedia'])),
      ...this.asObject(this.readPath(settings, ['socialLinks'])),
      ...this.asObject(this.readPath(settings, ['customerApp', 'socialMedia'])),
      ...this.asObject(this.readPath(settings, ['customerApp', 'socialLinks'])),
    };

    return {
      ...fromSettings,
      ...direct,
    };
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
