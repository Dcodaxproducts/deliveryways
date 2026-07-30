import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CurrencyDisplayFormat,
  PaymentMethod,
  PlatformDateFormat,
  Prisma,
  ServiceChargeType,
  VatHandlingRule,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { StorageService } from '../storage/storage.service';
import { GlobalSettingsRepository } from './global-settings.repository';
import {
  PaymentMethodSettingDto,
  TaxTypeSettingDto,
  UpdateGlobalPaymentMethodsDto,
  UpdateLandingPageSettingsDto,
  UpdateGlobalSettingsDto,
  UpdateGlobalTaxTypesDto,
} from './dto';
import {
  CustomerEmailTemplates,
  normalizeCustomerEmailTemplates,
  validateCustomerEmailTemplates,
} from './email-templates';
import { sanitizeLandingContentHtml } from './landing-page-content.util';

export interface NotificationChannelMatrix {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
}

export interface NotificationSettingsShape {
  emailAddress: string | null;
  phoneNumber: string | null;
  whatsappNumber: string | null;
  notificationTypes: Record<
    | 'newOrder'
    | 'orderCancelled'
    | 'printerError'
    | 'dailyReport'
    | 'payoutUpdate',
    NotificationChannelMatrix
  >;
  emailTemplates: CustomerEmailTemplates;
}

export interface PaymentMethodSettingsShape {
  code: PaymentMethod;
  label: string;
  isActive: boolean;
}

export interface TaxTypeSettingsShape {
  code: string;
  label: string;
  percentage: number;
  isActive: boolean;
  isDefault: boolean;
}

export interface ServiceChargeSettingsShape {
  isEnabled: boolean;
  type: ServiceChargeType;
  value: number;
}

export interface LandingPageSettingsShape {
  businessName: string;
  logoUrl: string | null;
  footerDescription: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  address: string | null;
  copyrightText: string;
  socialLinks: {
    facebook: string | null;
    twitter: string | null;
    instagram: string | null;
    youtube: string | null;
  };
  home: LandingHomeSettingsShape;
  pages: LandingPagePagesShape;
  faqs: LandingPageFaqShape[];
}

export interface LandingHomeLocalizedBlockShape {
  headingEn: string | null;
  headingDe: string | null;
  descriptionEn: string | null;
  descriptionDe: string | null;
  checklistEn: string[];
  checklistDe: string[];
  imageUrl: string | null;
  isVisible: boolean;
}

export interface LandingHomeSettingsShape {
  hero: {
    badgeEn: string | null;
    badgeDe: string | null;
    headingEn: string | null;
    headingDe: string | null;
    subheadingEn: string | null;
    subheadingDe: string | null;
    imageUrl: string | null;
    primaryCtaEn: string | null;
    primaryCtaDe: string | null;
    primaryCtaUrl: string | null;
    secondaryCtaEn: string | null;
    secondaryCtaDe: string | null;
    secondaryCtaUrl: string | null;
  };
  featuredRestaurants: {
    headingEn: string | null;
    headingDe: string | null;
    restaurantIds: string[];
    isVisible: boolean;
  };
  growth: LandingHomeLocalizedBlockShape;
  orderManagement: LandingHomeLocalizedBlockShape;
  appDownload: {
    headingEn: string | null;
    headingDe: string | null;
    descriptionEn: string | null;
    descriptionDe: string | null;
    backgroundImageUrl: string | null;
    googlePlayUrl: string | null;
    appStoreUrl: string | null;
    isVisible: boolean;
  };
}

export interface LandingPageHeroShape {
  eyebrowEn: string | null;
  eyebrowDe: string | null;
  headingEn: string | null;
  headingDe: string | null;
  subheadingEn: string | null;
  subheadingDe: string | null;
}

export interface LandingPageContentShape {
  hero: LandingPageHeroShape;
  contentEn: string | null;
  contentDe: string | null;
}

export type LandingPagePagesShape = Record<
  | 'services'
  | 'pricing'
  | 'about'
  | 'privacyPolicy'
  | 'support'
  | 'termsOfService'
  | 'contact',
  LandingPageContentShape
>;

export interface LandingPageFaqShape {
  id: string;
  questionEn: string;
  answerEn: string;
  questionDe: string;
  answerDe: string;
  isActive: boolean;
  sortOrder: number;
}

interface NormalizedGlobalSettingsInput {
  globalTaxPercentage?: Prisma.Decimal;
  vatHandlingRule?: VatHandlingRule;
  defaultCommissionPercentage?: Prisma.Decimal;
  defaultHybridFeePercentage?: Prisma.Decimal;
  defaultCurrency?: string;
  currencyDisplayFormat?: CurrencyDisplayFormat;
  defaultLanguage?: string;
  dateFormat?: PlatformDateFormat;
  timezone?: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  fontFamily?: string | null;
  cartExpiryMinutes?: number;
  serviceChargeEnabled?: boolean;
  serviceChargeType?: ServiceChargeType;
  serviceChargeValue?: Prisma.Decimal;
  notificationSettings?: Prisma.InputJsonValue;
  landingPageSettings?: Prisma.InputJsonValue;
  paymentMethods?: Prisma.InputJsonValue;
  taxTypes?: Prisma.InputJsonValue;
  isTaxEnforced?: boolean;
  isCommissionEnforced?: boolean;
  isCurrencyEnforced?: boolean;
  isLocalizationEnforced?: boolean;
}

@Injectable()
export class GlobalSettingsService {
  constructor(
    private readonly globalSettingsRepository: GlobalSettingsRepository,
    private readonly storageService: StorageService,
  ) {}

  async getSettings() {
    const data = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );

    return {
      data: this.serializeSettings(data),
      message: 'Global settings fetched successfully',
    };
  }

  async getPublicLandingPageSettings() {
    const data = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );
    const settings = this.extractLandingPageSettings(data.landingPageSettings);

    return {
      data: {
        ...settings,
        logoUrl: await this.storageService.resolveViewUrl(settings.logoUrl),
        faqs: settings.faqs.filter((faq) => faq.isActive),
      },
      message: 'Landing page settings fetched successfully',
    };
  }

  async getLandingPageSettings() {
    const data = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );

    return {
      data: this.extractLandingPageSettings(data.landingPageSettings),
      message: 'Landing page settings fetched successfully',
    };
  }

  async getDefaultCurrencyCode(): Promise<string> {
    const data = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );

    return data.defaultCurrency.trim().toUpperCase();
  }

  async getCustomerEmailConfiguration(): Promise<{
    defaultLanguage: string;
    templates: CustomerEmailTemplates;
  }> {
    const data = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );

    return {
      defaultLanguage: data.defaultLanguage,
      templates: this.extractNotificationSettings(data.notificationSettings)
        .emailTemplates,
    };
  }

  async getCartExpiryMinutes(): Promise<number> {
    const data = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );

    return data.cartExpiryMinutes;
  }

  async getPayoutProviderSettings(): Promise<Prisma.JsonValue | null> {
    const data = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );

    return data.payoutProviderSettings;
  }

  async updatePayoutProviderSettings(
    user: AuthUserContext,
    settings: Prisma.InputJsonValue,
  ): Promise<Prisma.JsonValue | null> {
    const data = await this.globalSettingsRepository.updateSingleton(
      {
        payoutProviderSettings: settings,
        updatedBy: user.uid,
      },
      {
        ...this.buildDefaultCreateInput(),
        payoutProviderSettings: settings,
        createdBy: user.uid,
        updatedBy: user.uid,
      },
    );

    return data.payoutProviderSettings;
  }

  async getServiceChargeConfig(): Promise<ServiceChargeSettingsShape> {
    const data = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );

    return this.extractServiceChargeSettings(data);
  }

  async updateSettings(user: AuthUserContext, dto: UpdateGlobalSettingsDto) {
    const current = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );
    const normalized = this.normalizeUpdateDto(
      dto,
      current.notificationSettings,
      current.paymentMethods,
      current.taxTypes,
      current.landingPageSettings,
    );

    const data = await this.globalSettingsRepository.updateSingleton(
      this.toUpdateInput(normalized, user.uid),
      this.toCreateInput(normalized, user.uid),
    );

    return {
      data: this.serializeSettings(data),
      message: 'Global settings updated successfully',
    };
  }

  async updateLandingPageSettings(
    user: AuthUserContext,
    dto: UpdateLandingPageSettingsDto,
  ) {
    const current = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );
    const landingPageSettings = this.mergeLandingPageSettings(
      current.landingPageSettings,
      dto,
    );
    const data = await this.globalSettingsRepository.updateSingleton(
      {
        landingPageSettings,
        updatedBy: user.uid,
      },
      {
        ...this.buildDefaultCreateInput(),
        landingPageSettings,
        createdBy: user.uid,
        updatedBy: user.uid,
      },
    );

    return {
      data: this.extractLandingPageSettings(data.landingPageSettings),
      message: 'Landing page settings updated successfully',
    };
  }

  async getPaymentMethods() {
    const data = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );

    return {
      data: this.extractPaymentMethods(data.paymentMethods),
      message: 'Payment methods fetched successfully',
    };
  }

  async updatePaymentMethods(
    user: AuthUserContext,
    dto: UpdateGlobalPaymentMethodsDto,
  ) {
    const current = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );
    const paymentMethods = this.mergePaymentMethods(
      current.paymentMethods,
      dto.paymentMethods,
    );

    const data = await this.globalSettingsRepository.updateSingleton(
      {
        paymentMethods,
        updatedBy: user.uid,
      },
      {
        ...this.buildDefaultCreateInput(),
        paymentMethods,
        createdBy: user.uid,
        updatedBy: user.uid,
      },
    );

    return {
      data: this.extractPaymentMethods(data.paymentMethods),
      message: 'Payment methods updated successfully',
    };
  }

  async getTaxTypes() {
    const data = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );

    return {
      data: this.extractTaxTypes(data.taxTypes, data.globalTaxPercentage),
      message: 'Tax types fetched successfully',
    };
  }

  async updateTaxTypes(user: AuthUserContext, dto: UpdateGlobalTaxTypesDto) {
    const current = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );
    const taxTypes = this.mergeTaxTypes(
      current.taxTypes,
      dto.taxTypes,
      current.globalTaxPercentage,
    );

    const data = await this.globalSettingsRepository.updateSingleton(
      {
        taxTypes,
        updatedBy: user.uid,
      },
      {
        ...this.buildDefaultCreateInput(),
        taxTypes,
        createdBy: user.uid,
        updatedBy: user.uid,
      },
    );

    return {
      data: this.extractTaxTypes(data.taxTypes, data.globalTaxPercentage),
      message: 'Tax types updated successfully',
    };
  }

  private buildDefaultCreateInput(): Prisma.GlobalSettingCreateInput {
    return {
      scopeKey: 'GLOBAL',
      globalTaxPercentage: new Prisma.Decimal(0),
      vatHandlingRule: VatHandlingRule.EXCLUSIVE,
      defaultCommissionPercentage: new Prisma.Decimal(0),
      defaultHybridFeePercentage: new Prisma.Decimal(0),
      defaultCurrency: 'PKR',
      currencyDisplayFormat: CurrencyDisplayFormat.SYMBOL_AMOUNT,
      defaultLanguage: 'de',
      dateFormat: PlatformDateFormat.DD_MM_YYYY,
      timezone: 'Asia/Karachi',
      primaryColor: null,
      secondaryColor: null,
      fontFamily: null,
      serviceChargeEnabled: false,
      serviceChargeType: ServiceChargeType.PERCENTAGE,
      serviceChargeValue: new Prisma.Decimal(0),
      cartExpiryMinutes: 720,
      notificationSettings: this.buildDefaultNotificationSettings(),
      landingPageSettings: this.buildDefaultLandingPageSettings(),
      paymentMethods: this.buildDefaultPaymentMethods(),
      taxTypes: this.buildDefaultTaxTypes(new Prisma.Decimal(0)),
      isTaxEnforced: false,
      isCommissionEnforced: false,
      isCurrencyEnforced: false,
      isLocalizationEnforced: false,
      createdBy: null,
      updatedBy: null,
    };
  }

  private normalizeUpdateDto(
    dto: UpdateGlobalSettingsDto,
    currentNotificationSettings?: Prisma.JsonValue | null,
    currentPaymentMethods?: Prisma.JsonValue | null,
    currentTaxTypes?: Prisma.JsonValue | null,
    currentLandingPageSettings?: Prisma.JsonValue | null,
  ): NormalizedGlobalSettingsInput {
    if (dto.timezone !== undefined) {
      this.assertValidTimeZone(dto.timezone);
    }

    return {
      globalTaxPercentage:
        dto.globalTaxPercentage !== undefined
          ? new Prisma.Decimal(dto.globalTaxPercentage)
          : undefined,
      vatHandlingRule: dto.vatHandlingRule,
      defaultCommissionPercentage:
        dto.defaultCommissionPercentage !== undefined
          ? new Prisma.Decimal(dto.defaultCommissionPercentage)
          : undefined,
      defaultHybridFeePercentage:
        dto.defaultHybridFeePercentage !== undefined
          ? new Prisma.Decimal(dto.defaultHybridFeePercentage)
          : undefined,
      defaultCurrency:
        dto.defaultCurrency !== undefined
          ? dto.defaultCurrency.trim().toUpperCase()
          : undefined,
      currencyDisplayFormat: dto.currencyDisplayFormat,
      defaultLanguage:
        dto.defaultLanguage !== undefined
          ? dto.defaultLanguage.trim().toLowerCase()
          : undefined,
      dateFormat: dto.dateFormat,
      timezone: dto.timezone !== undefined ? dto.timezone.trim() : undefined,
      primaryColor:
        dto.primaryColor !== undefined
          ? (this.resolveOptionalString(dto.primaryColor)?.toUpperCase() ??
            null)
          : undefined,
      secondaryColor:
        dto.secondaryColor !== undefined
          ? (this.resolveOptionalString(dto.secondaryColor)?.toUpperCase() ??
            null)
          : undefined,
      fontFamily:
        dto.fontFamily !== undefined
          ? this.resolveOptionalString(dto.fontFamily)
          : undefined,
      cartExpiryMinutes: dto.cartExpiryMinutes,
      notificationSettings:
        dto.notificationSettings !== undefined
          ? this.mergeNotificationSettings(
              currentNotificationSettings,
              dto.notificationSettings,
            )
          : undefined,
      landingPageSettings:
        dto.landingPageSettings !== undefined
          ? this.mergeLandingPageSettings(
              currentLandingPageSettings,
              dto.landingPageSettings,
            )
          : undefined,
      paymentMethods:
        dto.paymentMethods !== undefined
          ? this.mergePaymentMethods(currentPaymentMethods, dto.paymentMethods)
          : undefined,
      taxTypes:
        dto.taxTypes !== undefined
          ? this.mergeTaxTypes(
              currentTaxTypes,
              dto.taxTypes,
              dto.globalTaxPercentage !== undefined
                ? new Prisma.Decimal(dto.globalTaxPercentage)
                : undefined,
            )
          : dto.globalTaxPercentage !== undefined
            ? this.refreshDefaultTaxTypePercentage(
                currentTaxTypes,
                new Prisma.Decimal(dto.globalTaxPercentage),
              )
            : undefined,
      isTaxEnforced: dto.isTaxEnforced,
      isCommissionEnforced: dto.isCommissionEnforced,
      isCurrencyEnforced: dto.isCurrencyEnforced,
      isLocalizationEnforced: dto.isLocalizationEnforced,
    };
  }

  private toUpdateInput(
    input: NormalizedGlobalSettingsInput,
    userId: string,
  ): Prisma.GlobalSettingUpdateInput {
    return {
      ...input,
      updatedBy: userId,
    };
  }

  private toCreateInput(
    input: NormalizedGlobalSettingsInput,
    userId: string,
  ): Prisma.GlobalSettingCreateInput {
    return {
      ...this.buildDefaultCreateInput(),
      ...input,
      createdBy: userId,
      updatedBy: userId,
    };
  }

  private serializeSettings<
    T extends {
      globalTaxPercentage?: Prisma.Decimal | number | null;
      notificationSettings?: Prisma.JsonValue | null;
      landingPageSettings?: Prisma.JsonValue | null;
      paymentMethods?: Prisma.JsonValue | null;
      taxTypes?: Prisma.JsonValue | null;
      serviceChargeEnabled?: boolean | null;
      serviceChargeType?: ServiceChargeType | null;
      serviceChargeValue?: Prisma.Decimal | number | string | null;
    },
  >(settings: T) {
    return {
      ...settings,
      notificationSettings: this.extractNotificationSettings(
        settings.notificationSettings,
      ),
      landingPageSettings: this.extractLandingPageSettings(
        settings.landingPageSettings,
      ),
      paymentMethods: this.extractPaymentMethods(settings.paymentMethods),
      taxTypes: this.extractTaxTypes(
        settings.taxTypes,
        settings.globalTaxPercentage,
      ),
      serviceCharge: {
        configScope: 'RESTAURANT',
        message: 'Service charge is configured per restaurant by super admin.',
      },
      transactionFee: {
        configScope: 'GLOBAL',
        message: 'Transaction fee is configured at platform/global level.',
      },
    };
  }

  private extractServiceChargeSettings(settings: {
    serviceChargeEnabled?: boolean | null;
    serviceChargeType?: ServiceChargeType | null;
    serviceChargeValue?: Prisma.Decimal | number | string | null;
  }): ServiceChargeSettingsShape {
    return {
      isEnabled: Boolean(settings.serviceChargeEnabled),
      type: settings.serviceChargeType ?? ServiceChargeType.PERCENTAGE,
      value: this.toNumber(settings.serviceChargeValue ?? 0),
    };
  }

  private buildDefaultNotificationSettings(): Prisma.InputJsonValue {
    return {
      emailAddress: null,
      phoneNumber: null,
      whatsappNumber: null,
      notificationTypes: this.defaultNotificationTypeMatrix(),
      emailTemplates: normalizeCustomerEmailTemplates(null),
    } as unknown as Prisma.InputJsonValue;
  }

  private buildDefaultLandingPageSettings(): Prisma.InputJsonValue {
    return this.defaultLandingPageSettings() as unknown as Prisma.InputJsonValue;
  }

  private defaultLandingPageSettings(): LandingPageSettingsShape {
    return {
      businessName: 'DeliveryWay',
      logoUrl: null,
      footerDescription: null,
      supportEmail: null,
      supportPhone: null,
      address: null,
      copyrightText: `© ${new Date().getFullYear()} DeliveryWay. All rights reserved.`,
      socialLinks: {
        facebook: null,
        twitter: null,
        instagram: null,
        youtube: null,
      },
      home: this.defaultLandingHomeSettings(),
      pages: this.defaultLandingPagePages(),
      faqs: [],
    };
  }

  private defaultLandingHomeSettings(): LandingHomeSettingsShape {
    const emptyBlock = (): LandingHomeLocalizedBlockShape => ({
      headingEn: null,
      headingDe: null,
      descriptionEn: null,
      descriptionDe: null,
      checklistEn: [],
      checklistDe: [],
      imageUrl: null,
      isVisible: true,
    });

    return {
      hero: {
        badgeEn: null,
        badgeDe: null,
        headingEn: null,
        headingDe: null,
        subheadingEn: null,
        subheadingDe: null,
        imageUrl: null,
        primaryCtaEn: null,
        primaryCtaDe: null,
        primaryCtaUrl: null,
        secondaryCtaEn: null,
        secondaryCtaDe: null,
        secondaryCtaUrl: null,
      },
      featuredRestaurants: {
        headingEn: null,
        headingDe: null,
        restaurantIds: [],
        isVisible: true,
      },
      growth: emptyBlock(),
      orderManagement: emptyBlock(),
      appDownload: {
        headingEn: null,
        headingDe: null,
        descriptionEn: null,
        descriptionDe: null,
        backgroundImageUrl: null,
        googlePlayUrl: null,
        appStoreUrl: null,
        isVisible: true,
      },
    };
  }

  private defaultLandingPagePages(): LandingPagePagesShape {
    const emptyPage = (): LandingPageContentShape => ({
      hero: {
        eyebrowEn: null,
        eyebrowDe: null,
        headingEn: null,
        headingDe: null,
        subheadingEn: null,
        subheadingDe: null,
      },
      contentEn: null,
      contentDe: null,
    });

    return {
      services: emptyPage(),
      pricing: emptyPage(),
      about: emptyPage(),
      privacyPolicy: emptyPage(),
      support: emptyPage(),
      termsOfService: emptyPage(),
      contact: emptyPage(),
    };
  }

  private buildDefaultPaymentMethods(): Prisma.InputJsonValue {
    return this.defaultPaymentMethods() as unknown as Prisma.InputJsonValue;
  }

  private buildDefaultTaxTypes(
    globalTaxPercentage?: Prisma.Decimal | number | null,
  ): Prisma.InputJsonValue {
    return this.defaultTaxTypes(
      globalTaxPercentage,
    ) as unknown as Prisma.InputJsonValue;
  }

  private defaultTaxTypes(
    globalTaxPercentage?: Prisma.Decimal | number | null,
  ): TaxTypeSettingsShape[] {
    return [
      {
        code: 'STANDARD',
        label: 'Standard tax',
        percentage: this.toNumber(globalTaxPercentage ?? 0),
        isActive: true,
        isDefault: true,
      },
      {
        code: 'REDUCED',
        label: 'Reduced tax',
        percentage: 0,
        isActive: true,
        isDefault: false,
      },
      {
        code: 'ZERO',
        label: 'Zero tax',
        percentage: 0,
        isActive: true,
        isDefault: false,
      },
    ];
  }

  private defaultPaymentMethods(): PaymentMethodSettingsShape[] {
    return Object.values(PaymentMethod).map((code) => ({
      code,
      label: this.paymentMethodLabel(code),
      isActive:
        code === PaymentMethod.COD ||
        code === PaymentMethod.CARD_ON_DELIVERY ||
        code === PaymentMethod.PAYPAL ||
        code === PaymentMethod.WALLET,
    }));
  }

  private mergePaymentMethods(
    currentSource: Prisma.JsonValue | null | undefined,
    updates: PaymentMethodSettingDto[],
  ): Prisma.InputJsonValue {
    const merged = new Map(
      this.extractPaymentMethods(currentSource).map((method) => [
        method.code,
        method,
      ]),
    );
    const seen = new Set<PaymentMethod>();

    for (const update of updates) {
      if (seen.has(update.code)) {
        throw new BadRequestException('Duplicate payment method code');
      }

      seen.add(update.code);

      const current = merged.get(update.code) ?? {
        code: update.code,
        label: this.paymentMethodLabel(update.code),
        isActive: false,
      };

      merged.set(update.code, {
        code: update.code,
        label:
          update.label !== undefined
            ? (this.resolveOptionalString(update.label) ??
              this.paymentMethodLabel(update.code))
            : current.label,
        isActive:
          update.isActive !== undefined ? update.isActive : current.isActive,
      });
    }

    return Array.from(merged.values()) as unknown as Prisma.InputJsonValue;
  }

  private extractPaymentMethods(
    source: Prisma.JsonValue | null | undefined,
  ): PaymentMethodSettingsShape[] {
    const overrides = new Map<
      PaymentMethod,
      Partial<PaymentMethodSettingsShape>
    >();

    if (Array.isArray(source)) {
      for (const row of source) {
        const objectRow = this.asObject(row);
        const code = objectRow.code;

        if (!this.isPaymentMethod(code)) {
          continue;
        }

        overrides.set(code, {
          label:
            typeof objectRow.label === 'string' &&
            objectRow.label.trim().length > 0
              ? objectRow.label.trim()
              : undefined,
          isActive:
            typeof objectRow.isActive === 'boolean'
              ? objectRow.isActive
              : undefined,
        });
      }
    }

    return this.defaultPaymentMethods().map((method) => {
      const override = overrides.get(method.code);

      return {
        ...method,
        ...override,
      };
    });
  }

  private isPaymentMethod(value: unknown): value is PaymentMethod {
    return Object.values(PaymentMethod).includes(value as PaymentMethod);
  }

  private mergeTaxTypes(
    currentSource: Prisma.JsonValue | null | undefined,
    updates: TaxTypeSettingDto[],
    globalTaxPercentage?: Prisma.Decimal | number | null,
  ): Prisma.InputJsonValue {
    const merged = new Map(
      this.extractTaxTypes(currentSource, globalTaxPercentage).map(
        (taxType) => [taxType.code, taxType],
      ),
    );
    const seen = new Set<string>();

    for (const update of updates) {
      const code = update.code.trim().toUpperCase();
      if (seen.has(code)) {
        throw new BadRequestException('Duplicate tax type code');
      }

      seen.add(code);

      const current = merged.get(code) ?? {
        code,
        label: code,
        percentage: 0,
        isActive: true,
        isDefault: false,
      };

      merged.set(code, {
        code,
        label:
          update.label !== undefined
            ? (this.resolveOptionalString(update.label) ?? code)
            : current.label,
        percentage: update.percentage,
        isActive:
          update.isActive !== undefined ? update.isActive : current.isActive,
        isDefault:
          update.isDefault !== undefined ? update.isDefault : current.isDefault,
      });
    }

    return this.normalizeTaxTypeDefaults(
      Array.from(merged.values()),
    ) as unknown as Prisma.InputJsonValue;
  }

  private refreshDefaultTaxTypePercentage(
    currentSource: Prisma.JsonValue | null | undefined,
    globalTaxPercentage: Prisma.Decimal,
  ): Prisma.InputJsonValue {
    return this.extractTaxTypes(currentSource, globalTaxPercentage).map(
      (taxType) =>
        taxType.isDefault
          ? { ...taxType, percentage: this.toNumber(globalTaxPercentage) }
          : taxType,
    ) as unknown as Prisma.InputJsonValue;
  }

  private extractTaxTypes(
    source: Prisma.JsonValue | null | undefined,
    globalTaxPercentage?: Prisma.Decimal | number | null,
  ): TaxTypeSettingsShape[] {
    const fallback = this.defaultTaxTypes(globalTaxPercentage);

    if (!Array.isArray(source)) {
      return fallback;
    }

    const taxTypes = source.flatMap((row) => {
      const objectRow = this.asObject(row);
      const code =
        typeof objectRow.code === 'string'
          ? objectRow.code.trim().toUpperCase()
          : '';

      if (!code) {
        return [];
      }

      return [
        {
          code,
          label:
            typeof objectRow.label === 'string' &&
            objectRow.label.trim().length > 0
              ? objectRow.label.trim()
              : code,
          percentage: this.toNumber(objectRow.percentage ?? 0),
          isActive:
            typeof objectRow.isActive === 'boolean' ? objectRow.isActive : true,
          isDefault:
            typeof objectRow.isDefault === 'boolean'
              ? objectRow.isDefault
              : false,
        },
      ];
    });

    return taxTypes.length ? this.normalizeTaxTypeDefaults(taxTypes) : fallback;
  }

  private normalizeTaxTypeDefaults(taxTypes: TaxTypeSettingsShape[]) {
    let defaultAssigned = false;

    return taxTypes.map((taxType, index) => {
      const shouldBeDefault =
        (taxType.isDefault && !defaultAssigned) ||
        (!defaultAssigned && index === 0);
      if (shouldBeDefault) {
        defaultAssigned = true;
      }

      return {
        ...taxType,
        percentage: Number(taxType.percentage.toFixed(2)),
        isDefault: shouldBeDefault,
      };
    });
  }

  private paymentMethodLabel(code: PaymentMethod) {
    switch (code) {
      case PaymentMethod.COD:
        return 'Cash on delivery';
      case PaymentMethod.CARD_ON_DELIVERY:
        return 'Card on delivery';
      case PaymentMethod.STRIPE:
        return 'Stripe';
      case PaymentMethod.PAYPAL:
        return 'PayPal';
      case PaymentMethod.EASYPAISA:
        return 'Easypaisa';
      case PaymentMethod.JAZZCASH:
        return 'JazzCash';
      case PaymentMethod.BANK_TRANSFER:
        return 'Bank transfer';
      case PaymentMethod.WALLET:
        return 'Wallet';
    }
  }

  private defaultNotificationTypeMatrix(): Record<
    | 'newOrder'
    | 'orderCancelled'
    | 'printerError'
    | 'dailyReport'
    | 'payoutUpdate',
    NotificationChannelMatrix
  > {
    return {
      newOrder: { email: false, sms: false, whatsapp: false },
      orderCancelled: { email: false, sms: false, whatsapp: false },
      printerError: { email: false, sms: false, whatsapp: false },
      dailyReport: { email: false, sms: false, whatsapp: false },
      payoutUpdate: { email: false, sms: false, whatsapp: false },
    };
  }

  private mergeNotificationSettings(
    currentSource: Prisma.JsonValue | null | undefined,
    updates: NonNullable<UpdateGlobalSettingsDto['notificationSettings']>,
  ): Prisma.InputJsonValue {
    const current = this.extractNotificationSettings(currentSource);
    const notificationTypes = updates.notificationTypes
      ? this.mergeNotificationTypeMatrix(
          current.notificationTypes,
          updates.notificationTypes as Record<string, unknown>,
        )
      : current.notificationTypes;
    const emailTemplates = updates.emailTemplates
      ? normalizeCustomerEmailTemplates({
          ...current.emailTemplates,
          ...updates.emailTemplates,
        })
      : current.emailTemplates;

    const merged = {
      emailAddress:
        updates.emailAddress !== undefined
          ? (updates.emailAddress ?? null)
          : current.emailAddress,
      phoneNumber:
        updates.phoneNumber !== undefined
          ? (updates.phoneNumber ?? null)
          : current.phoneNumber,
      whatsappNumber:
        updates.whatsappNumber !== undefined
          ? (updates.whatsappNumber ?? null)
          : current.whatsappNumber,
      notificationTypes,
      emailTemplates,
    } satisfies NotificationSettingsShape;

    this.validateNotificationSettings(merged);

    return merged as unknown as Prisma.InputJsonValue;
  }

  private extractNotificationSettings(
    source: Prisma.JsonValue | null | undefined,
  ): NotificationSettingsShape {
    return {
      emailAddress: this.readStringValue(source, [['emailAddress']]),
      phoneNumber: this.readStringValue(source, [['phoneNumber']]),
      whatsappNumber: this.readStringValue(source, [['whatsappNumber']]),
      notificationTypes: this.extractNotificationTypeMatrix(source),
      emailTemplates: normalizeCustomerEmailTemplates(
        this.readPath(source, ['emailTemplates']),
      ),
    };
  }

  private mergeLandingPageSettings(
    currentSource: Prisma.JsonValue | null | undefined,
    updates: NonNullable<UpdateGlobalSettingsDto['landingPageSettings']>,
  ): Prisma.InputJsonValue {
    const current = this.extractLandingPageSettings(currentSource);

    const merged = {
      businessName:
        updates.businessName !== undefined
          ? this.resolveOptionalString(updates.businessName) || 'DeliveryWay'
          : current.businessName,
      logoUrl:
        updates.logoUrl !== undefined
          ? this.resolveOptionalString(updates.logoUrl)
          : current.logoUrl,
      footerDescription:
        updates.footerDescription !== undefined
          ? this.resolveOptionalString(updates.footerDescription)
          : current.footerDescription,
      supportEmail:
        updates.supportEmail !== undefined
          ? this.resolveOptionalString(updates.supportEmail)
          : current.supportEmail,
      supportPhone:
        updates.supportPhone !== undefined
          ? this.resolveOptionalString(updates.supportPhone)
          : current.supportPhone,
      address:
        updates.address !== undefined
          ? this.resolveOptionalString(updates.address)
          : current.address,
      copyrightText:
        updates.copyrightText !== undefined
          ? this.resolveOptionalString(updates.copyrightText) ||
            this.defaultLandingPageSettings().copyrightText
          : current.copyrightText,
      socialLinks: {
        facebook:
          updates.socialLinks?.facebook !== undefined
            ? this.resolveOptionalString(updates.socialLinks.facebook)
            : current.socialLinks.facebook,
        twitter:
          updates.socialLinks?.twitter !== undefined
            ? this.resolveOptionalString(updates.socialLinks.twitter)
            : current.socialLinks.twitter,
        instagram:
          updates.socialLinks?.instagram !== undefined
            ? this.resolveOptionalString(updates.socialLinks.instagram)
            : current.socialLinks.instagram,
        youtube:
          updates.socialLinks?.youtube !== undefined
            ? this.resolveOptionalString(updates.socialLinks.youtube)
            : current.socialLinks.youtube,
      },
      home: updates.home
        ? this.extractLandingHomeSettings({
            home: {
              ...current.home,
              ...updates.home,
              hero: { ...current.home.hero, ...updates.home.hero },
              featuredRestaurants: {
                ...current.home.featuredRestaurants,
                ...updates.home.featuredRestaurants,
              },
              growth: { ...current.home.growth, ...updates.home.growth },
              orderManagement: {
                ...current.home.orderManagement,
                ...updates.home.orderManagement,
              },
              appDownload: {
                ...current.home.appDownload,
                ...updates.home.appDownload,
              },
            },
          } as unknown as Prisma.JsonValue)
        : current.home,
      pages: this.mergeLandingPagePages(current.pages, updates.pages),
      faqs:
        updates.faqs !== undefined
          ? updates.faqs
              .map((faq) => ({
                id: faq.id.trim(),
                questionEn: faq.questionEn.trim(),
                answerEn: faq.answerEn.trim(),
                questionDe: faq.questionDe.trim(),
                answerDe: faq.answerDe.trim(),
                isActive: faq.isActive,
                sortOrder: faq.sortOrder,
              }))
              .sort(
                (left, right) =>
                  left.sortOrder - right.sortOrder ||
                  left.id.localeCompare(right.id),
              )
          : current.faqs,
    } satisfies LandingPageSettingsShape;

    return merged as unknown as Prisma.InputJsonValue;
  }

  private extractLandingPageSettings(
    source: Prisma.JsonValue | null | undefined,
  ): LandingPageSettingsShape {
    const defaults = this.defaultLandingPageSettings();

    return {
      businessName:
        this.readStringValue(source, [['businessName']]) ??
        defaults.businessName,
      logoUrl: this.readStringValue(source, [['logoUrl']]),
      footerDescription: this.readStringValue(source, [['footerDescription']]),
      supportEmail: this.readStringValue(source, [['supportEmail']]),
      supportPhone: this.readStringValue(source, [['supportPhone']]),
      address: this.readStringValue(source, [['address']]),
      copyrightText:
        this.readStringValue(source, [['copyrightText']]) ??
        defaults.copyrightText,
      socialLinks: {
        facebook: this.readStringValue(source, [['socialLinks', 'facebook']]),
        twitter: this.readStringValue(source, [['socialLinks', 'twitter']]),
        instagram: this.readStringValue(source, [['socialLinks', 'instagram']]),
        youtube: this.readStringValue(source, [['socialLinks', 'youtube']]),
      },
      home: this.extractLandingHomeSettings(source),
      pages: this.extractLandingPagePages(source),
      faqs: this.extractLandingPageFaqs(source),
    };
  }

  private extractLandingHomeSettings(
    source: Prisma.JsonValue | null | undefined,
  ): LandingHomeSettingsShape {
    const read = (section: string, key: string) =>
      this.readStringValue(source, [['home', section, key]]);
    const readStrings = (section: string, key: string) => {
      const value = this.readPath(source, ['home', section, key]);
      return Array.isArray(value)
        ? value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
    };
    const readVisible = (section: string) => {
      const value = this.readPath(source, ['home', section, 'isVisible']);
      return typeof value === 'boolean' ? value : true;
    };

    return {
      hero: {
        badgeEn: read('hero', 'badgeEn'),
        badgeDe: read('hero', 'badgeDe'),
        headingEn: read('hero', 'headingEn'),
        headingDe: read('hero', 'headingDe'),
        subheadingEn: read('hero', 'subheadingEn'),
        subheadingDe: read('hero', 'subheadingDe'),
        imageUrl: read('hero', 'imageUrl'),
        primaryCtaEn: read('hero', 'primaryCtaEn'),
        primaryCtaDe: read('hero', 'primaryCtaDe'),
        primaryCtaUrl: read('hero', 'primaryCtaUrl'),
        secondaryCtaEn: read('hero', 'secondaryCtaEn'),
        secondaryCtaDe: read('hero', 'secondaryCtaDe'),
        secondaryCtaUrl: read('hero', 'secondaryCtaUrl'),
      },
      featuredRestaurants: {
        headingEn: read('featuredRestaurants', 'headingEn'),
        headingDe: read('featuredRestaurants', 'headingDe'),
        restaurantIds: readStrings('featuredRestaurants', 'restaurantIds'),
        isVisible: readVisible('featuredRestaurants'),
      },
      growth: this.extractLandingHomeBlock(source, 'growth'),
      orderManagement: this.extractLandingHomeBlock(source, 'orderManagement'),
      appDownload: {
        headingEn: read('appDownload', 'headingEn'),
        headingDe: read('appDownload', 'headingDe'),
        descriptionEn: read('appDownload', 'descriptionEn'),
        descriptionDe: read('appDownload', 'descriptionDe'),
        backgroundImageUrl: read('appDownload', 'backgroundImageUrl'),
        googlePlayUrl: read('appDownload', 'googlePlayUrl'),
        appStoreUrl: read('appDownload', 'appStoreUrl'),
        isVisible: readVisible('appDownload'),
      },
    } satisfies LandingHomeSettingsShape;
  }

  private extractLandingHomeBlock(
    source: Prisma.JsonValue | null | undefined,
    section: 'growth' | 'orderManagement',
  ): LandingHomeLocalizedBlockShape {
    const value = (key: string) =>
      this.readStringValue(source, [['home', section, key]]);
    const checklist = (key: 'checklistEn' | 'checklistDe') => {
      const raw = this.readPath(source, ['home', section, key]);
      return Array.isArray(raw)
        ? raw
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
    };
    const visible = this.readPath(source, ['home', section, 'isVisible']);

    return {
      headingEn: value('headingEn'),
      headingDe: value('headingDe'),
      descriptionEn: value('descriptionEn'),
      descriptionDe: value('descriptionDe'),
      checklistEn: checklist('checklistEn'),
      checklistDe: checklist('checklistDe'),
      imageUrl: value('imageUrl'),
      isVisible: typeof visible === 'boolean' ? visible : true,
    };
  }

  private mergeLandingPagePages(
    current: LandingPagePagesShape,
    updates: UpdateLandingPageSettingsDto['pages'],
  ): LandingPagePagesShape {
    if (!updates) {
      return current;
    }

    return {
      services: this.mergeLandingPageContent(
        current.services,
        updates.services,
      ),
      pricing: this.mergeLandingPageContent(current.pricing, updates.pricing),
      about: this.mergeLandingPageContent(current.about, updates.about),
      privacyPolicy: this.mergeLandingPageContent(
        current.privacyPolicy,
        updates.privacyPolicy,
      ),
      support: this.mergeLandingPageContent(current.support, updates.support),
      termsOfService: this.mergeLandingPageContent(
        current.termsOfService,
        updates.termsOfService,
      ),
      contact: this.mergeLandingPageContent(current.contact, updates.contact),
    };
  }

  private mergeLandingPageContent(
    current: LandingPageContentShape,
    updates:
      | NonNullable<UpdateLandingPageSettingsDto['pages']>['about']
      | undefined,
  ): LandingPageContentShape {
    if (!updates) {
      return current;
    }

    return {
      hero: {
        eyebrowEn: this.mergeOptionalLandingString(
          current.hero.eyebrowEn,
          updates.hero?.eyebrowEn,
        ),
        eyebrowDe: this.mergeOptionalLandingString(
          current.hero.eyebrowDe,
          updates.hero?.eyebrowDe,
        ),
        headingEn: this.mergeOptionalLandingString(
          current.hero.headingEn,
          updates.hero?.headingEn,
        ),
        headingDe: this.mergeOptionalLandingString(
          current.hero.headingDe,
          updates.hero?.headingDe,
        ),
        subheadingEn: this.mergeOptionalLandingString(
          current.hero.subheadingEn,
          updates.hero?.subheadingEn,
        ),
        subheadingDe: this.mergeOptionalLandingString(
          current.hero.subheadingDe,
          updates.hero?.subheadingDe,
        ),
      },
      contentEn:
        updates.contentEn !== undefined
          ? this.sanitizeOptionalLandingHtml(updates.contentEn)
          : current.contentEn,
      contentDe:
        updates.contentDe !== undefined
          ? this.sanitizeOptionalLandingHtml(updates.contentDe)
          : current.contentDe,
    };
  }

  private mergeOptionalLandingString(
    current: string | null,
    update: string | undefined,
  ): string | null {
    return update !== undefined ? this.resolveOptionalString(update) : current;
  }

  private sanitizeOptionalLandingHtml(value: string): string | null {
    const sanitized = sanitizeLandingContentHtml(value);
    return sanitized.length > 0 ? sanitized : null;
  }

  private extractLandingPagePages(
    source: Prisma.JsonValue | null | undefined,
  ): LandingPagePagesShape {
    return {
      services: this.extractLandingPageContent(source, 'services'),
      pricing: this.extractLandingPageContent(source, 'pricing'),
      about: this.extractLandingPageContent(source, 'about'),
      privacyPolicy: this.extractLandingPageContent(source, 'privacyPolicy'),
      support: this.extractLandingPageContent(source, 'support'),
      termsOfService: this.extractLandingPageContent(source, 'termsOfService'),
      contact: this.extractLandingPageContent(source, 'contact'),
    };
  }

  private extractLandingPageContent(
    source: Prisma.JsonValue | null | undefined,
    page: keyof LandingPagePagesShape,
  ): LandingPageContentShape {
    const heroPath = ['pages', page, 'hero'];
    const contentEn = this.readStringValue(source, [
      ['pages', page, 'contentEn'],
    ]);
    const contentDe = this.readStringValue(source, [
      ['pages', page, 'contentDe'],
    ]);

    return {
      hero: {
        eyebrowEn: this.readStringValue(source, [[...heroPath, 'eyebrowEn']]),
        eyebrowDe: this.readStringValue(source, [[...heroPath, 'eyebrowDe']]),
        headingEn: this.readStringValue(source, [[...heroPath, 'headingEn']]),
        headingDe: this.readStringValue(source, [[...heroPath, 'headingDe']]),
        subheadingEn: this.readStringValue(source, [
          [...heroPath, 'subheadingEn'],
        ]),
        subheadingDe: this.readStringValue(source, [
          [...heroPath, 'subheadingDe'],
        ]),
      },
      contentEn: contentEn ? sanitizeLandingContentHtml(contentEn) : null,
      contentDe: contentDe ? sanitizeLandingContentHtml(contentDe) : null,
    };
  }

  private extractLandingPageFaqs(source: Prisma.JsonValue | null | undefined) {
    const rawFaqs = this.readPath(source, ['faqs']);
    if (!Array.isArray(rawFaqs)) {
      return [];
    }

    return rawFaqs
      .map((value, index): LandingPageFaqShape | null => {
        const faq = this.asObject(value);
        const id = this.readStringValue(faq, [['id']]);
        const questionEn = this.readStringValue(faq, [['questionEn']]);
        const answerEn = this.readStringValue(faq, [['answerEn']]);
        const questionDe = this.readStringValue(faq, [['questionDe']]);
        const answerDe = this.readStringValue(faq, [['answerDe']]);

        if (!id || !questionEn || !answerEn || !questionDe || !answerDe) {
          return null;
        }

        const rawSortOrder = this.readPath(faq, ['sortOrder']);
        return {
          id,
          questionEn,
          answerEn,
          questionDe,
          answerDe,
          isActive: typeof faq.isActive === 'boolean' ? faq.isActive : true,
          sortOrder:
            typeof rawSortOrder === 'number' &&
            Number.isInteger(rawSortOrder) &&
            rawSortOrder >= 0
              ? rawSortOrder
              : index,
        };
      })
      .filter((faq): faq is LandingPageFaqShape => faq !== null)
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
      );
  }

  private extractNotificationTypeMatrix(source: unknown) {
    const keys = [
      'newOrder',
      'orderCancelled',
      'printerError',
      'dailyReport',
      'payoutUpdate',
    ] as const;

    return Object.fromEntries(
      keys.map((key) => [
        key,
        {
          email: this.readBooleanValue(source, [
            ['notificationTypes', key, 'email'],
          ]),
          sms: this.readBooleanValue(source, [
            ['notificationTypes', key, 'sms'],
          ]),
          whatsapp: this.readBooleanValue(source, [
            ['notificationTypes', key, 'whatsapp'],
          ]),
        },
      ]),
    ) as NotificationSettingsShape['notificationTypes'];
  }

  private mergeNotificationTypeMatrix(
    current: NotificationSettingsShape['notificationTypes'],
    updates: Record<string, unknown>,
  ): NotificationSettingsShape['notificationTypes'] {
    const keys = [
      'newOrder',
      'orderCancelled',
      'printerError',
      'dailyReport',
      'payoutUpdate',
    ] as const;

    return Object.fromEntries(
      keys.map((key) => {
        const updateRow = this.asObject(updates[key]);
        const existingRow = current[key];

        return [
          key,
          {
            email:
              typeof updateRow.email === 'boolean'
                ? updateRow.email
                : existingRow.email,
            sms:
              typeof updateRow.sms === 'boolean'
                ? updateRow.sms
                : existingRow.sms,
            whatsapp:
              typeof updateRow.whatsapp === 'boolean'
                ? updateRow.whatsapp
                : existingRow.whatsapp,
          },
        ];
      }),
    ) as NotificationSettingsShape['notificationTypes'];
  }

  private validateNotificationSettings(settings: NotificationSettingsShape) {
    validateCustomerEmailTemplates(settings.emailTemplates);

    if (
      this.isNotificationChannelUsed(settings.notificationTypes, 'email') &&
      !settings.emailAddress
    ) {
      throw new BadRequestException(
        'emailAddress is required when email notifications are selected',
      );
    }

    if (
      this.isNotificationChannelUsed(settings.notificationTypes, 'sms') &&
      !settings.phoneNumber
    ) {
      throw new BadRequestException(
        'phoneNumber is required when SMS notifications are selected',
      );
    }

    if (
      this.isNotificationChannelUsed(settings.notificationTypes, 'whatsapp') &&
      !settings.whatsappNumber
    ) {
      throw new BadRequestException(
        'whatsappNumber is required when WhatsApp notifications are selected',
      );
    }
  }

  private isNotificationChannelUsed(
    matrix: NotificationSettingsShape['notificationTypes'],
    channel: keyof NotificationChannelMatrix,
  ) {
    return Object.values(matrix).some((row) => row[channel]);
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

  private readPath(source: unknown, path: string[]) {
    let current: unknown = source;

    for (const segment of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return null;
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

  private assertValidServiceCharge(
    dto: UpdateGlobalSettingsDto,
    currentType?: ServiceChargeType | null,
  ) {
    const nextType =
      dto.serviceChargeType ?? currentType ?? ServiceChargeType.PERCENTAGE;
    if (
      nextType === ServiceChargeType.PERCENTAGE &&
      dto.serviceChargeValue !== undefined &&
      dto.serviceChargeValue > 100
    ) {
      throw new BadRequestException(
        'serviceChargeValue cannot exceed 100 for percentage service charges',
      );
    }
  }

  private assertValidTimeZone(value: string) {
    const normalized = value.trim();

    if (!normalized.length) {
      throw new BadRequestException('timezone cannot be empty');
    }

    try {
      Intl.DateTimeFormat(undefined, { timeZone: normalized });
    } catch {
      throw new BadRequestException('Invalid timezone value');
    }
  }

  private resolveOptionalString(value: string) {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private toNumber(value: unknown) {
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      !(value instanceof Prisma.Decimal)
    ) {
      return 0;
    }

    return Number(new Prisma.Decimal(value).toDecimalPlaces(2));
  }
}
