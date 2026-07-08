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
import { GlobalSettingsRepository } from './global-settings.repository';
import {
  PaymentMethodSettingDto,
  TaxTypeSettingDto,
  UpdateGlobalPaymentMethodsDto,
  UpdateGlobalSettingsDto,
  UpdateGlobalTaxTypesDto,
} from './dto';

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

  async getDefaultCurrencyCode(): Promise<string> {
    const data = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );

    return data.defaultCurrency.trim().toUpperCase();
  }

  async getCartExpiryMinutes(): Promise<number> {
    const data = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );

    return data.cartExpiryMinutes;
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
      defaultLanguage: 'en',
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
      paymentMethods: this.extractPaymentMethods(settings.paymentMethods),
      taxTypes: this.extractTaxTypes(
        settings.taxTypes,
        settings.globalTaxPercentage,
      ),
      serviceCharge: this.extractServiceChargeSettings(settings),
      transactionFee: {
        configScope: 'RESTAURANT',
        message: 'Transaction fee is configured per restaurant by super admin.',
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
    } as unknown as Prisma.InputJsonValue;
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
    };
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
