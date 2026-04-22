import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CurrencyDisplayFormat,
  PlatformDateFormat,
  Prisma,
  VatHandlingRule,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { GlobalSettingsRepository } from './global-settings.repository';
import { UpdateGlobalSettingsDto } from './dto';

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
  notificationSettings?: Prisma.InputJsonValue;
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

  async updateSettings(user: AuthUserContext, dto: UpdateGlobalSettingsDto) {
    const current = await this.globalSettingsRepository.ensureSingleton(
      this.buildDefaultCreateInput(),
    );
    const normalized = this.normalizeUpdateDto(
      dto,
      current.notificationSettings,
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
      notificationSettings: this.buildDefaultNotificationSettings(),
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
      notificationSettings:
        dto.notificationSettings !== undefined
          ? this.mergeNotificationSettings(
              currentNotificationSettings,
              dto.notificationSettings,
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
    T extends { notificationSettings?: Prisma.JsonValue | null },
  >(settings: T) {
    return {
      ...settings,
      notificationSettings: this.extractNotificationSettings(
        settings.notificationSettings,
      ),
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
}
