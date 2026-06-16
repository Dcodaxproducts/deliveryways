import { BadRequestException, Injectable } from '@nestjs/common';
import { CouponDiscountType, DeliverymanStatus } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { CreateCouponDto } from '../coupons/dto';
import { CouponsService } from '../coupons/coupons.service';
import { DeliverymenService } from '../deliverymen/deliverymen.service';
import { CreateAdminHappyHourDto, CreateAdminPromotionDto } from './dto';
import { AdminPromotionsService } from './admin-promotions.service';

export type AdminImportType =
  | 'deliverymen'
  | 'coupons'
  | 'promotions'
  | 'happy-hours';

export interface UploadedCsvFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

interface ParsedImportRow {
  rowNumber: number;
  data: Record<string, string>;
}

export interface ImportRowResult {
  rowNumber: number;
  status: 'imported' | 'failed';
  id?: string;
  email?: string;
  code?: string;
  error?: string;
}

@Injectable()
export class AdminImportsService {
  constructor(
    private readonly deliverymenService: DeliverymenService,
    private readonly couponsService: CouponsService,
    private readonly adminPromotionsService: AdminPromotionsService,
  ) {}

  async uploadCsv(user: AuthUserContext, type: string, file?: UploadedCsvFile) {
    const importType = this.parseImportType(type);
    const rows = this.parseCsvFile(file);
    const results: ImportRowResult[] = [];

    for (const row of rows) {
      try {
        const result = await this.importRow(user, importType, row.data);
        results.push({
          rowNumber: row.rowNumber,
          status: 'imported',
          id: result.id,
          email: result.email,
          code: result.code,
        });
      } catch (error) {
        results.push({
          rowNumber: row.rowNumber,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Row import failed',
        });
      }
    }

    const failed = results.filter((result) => result.status === 'failed');

    return {
      data: {
        type: importType,
        fileName: file?.originalname ?? null,
        totalRows: rows.length,
        imported: rows.length - failed.length,
        failed: failed.length,
        results,
      },
      message: `${this.importTypeLabel(importType)} import processed`,
    };
  }

  private importRow(
    user: AuthUserContext,
    type: AdminImportType,
    row: Record<string, string>,
  ): Promise<{ id: string; email?: string; code?: string }> {
    if (type === 'deliverymen') {
      return this.importDeliveryman(user, row);
    }

    if (type === 'coupons') {
      return this.importCoupon(user, row);
    }

    if (type === 'promotions') {
      return this.importPromotion(user, row);
    }

    return this.importHappyHour(user, row);
  }

  private async importDeliveryman(
    user: AuthUserContext,
    row: Record<string, string>,
  ) {
    const response = await this.deliverymenService.create(user, {
      restaurantId: this.optionalString(row.restaurantId),
      branchId: this.requiredString(row.branchId, 'branchId'),
      firstName: this.requiredString(row.firstName, 'firstName'),
      lastName: this.requiredString(row.lastName, 'lastName'),
      email: this.requiredString(row.email, 'email'),
      phone: this.requiredString(row.phone, 'phone'),
      vehicleType: this.optionalString(row.vehicleType),
      vehicleNumber: this.optionalString(row.vehicleNumber),
      password: this.optionalString(row.password),
      status: this.optionalDeliverymanStatus(row.status),
    });

    return {
      id: response.data.id,
      email: response.data.email,
    };
  }

  private async importCoupon(
    user: AuthUserContext,
    row: Record<string, string>,
  ) {
    const dto: CreateCouponDto = {
      restaurantId: this.optionalString(row.restaurantId),
      branchId: this.optionalString(row.branchId),
      code: this.requiredString(row.code, 'code'),
      title: this.requiredString(row.title, 'title'),
      description: this.optionalString(row.description),
      discountType: this.requiredDiscountType(row.discountType),
      discountValue: this.requiredNumber(row.discountValue, 'discountValue'),
      maxDiscountAmount: this.optionalNumber(row.maxDiscountAmount),
      minOrderAmount: this.optionalNumber(row.minOrderAmount),
      maxUses: this.optionalInteger(row.maxUses),
      maxUsesPerCustomer: this.optionalInteger(row.maxUsesPerCustomer),
      startsAt: this.requiredString(row.startsAt, 'startsAt'),
      expiresAt: this.requiredString(row.expiresAt, 'expiresAt'),
      scopeMenuItemId: this.optionalString(row.scopeMenuItemId),
      scopeCategoryId: this.optionalString(row.scopeCategoryId),
    };
    const response = await this.couponsService.create(user, dto);

    return {
      id: response.data.id,
      code: response.data.code,
    };
  }

  private async importPromotion(
    user: AuthUserContext,
    row: Record<string, string>,
  ) {
    const dto: CreateAdminPromotionDto = {
      restaurantId: this.optionalString(row.restaurantId),
      branchId: this.optionalString(row.branchId),
      code: this.optionalString(row.code),
      title: this.requiredString(row.title, 'title'),
      description: this.optionalString(row.description),
      imageUrl: this.optionalString(row.imageUrl),
      discountType: this.requiredPromotionDiscountType(row.discountType),
      discountValue: this.requiredNumber(row.discountValue, 'discountValue'),
      maxDiscountAmount: this.optionalNumber(row.maxDiscountAmount),
      minOrderAmount: this.optionalNumber(row.minOrderAmount),
      maxUses: this.optionalInteger(row.maxUses),
      maxUsesPerCustomer: this.optionalInteger(row.maxUsesPerCustomer),
      startsAt: this.requiredString(row.startsAt, 'startsAt'),
      expiresAt: this.requiredString(row.expiresAt, 'expiresAt'),
      scopeMenuItemId: this.optionalString(row.scopeMenuItemId),
      scopeCategoryId: this.optionalString(row.scopeCategoryId),
      scopeMenuItemIds: this.optionalStringList(row.scopeMenuItemIds),
      scopeCategoryIds: this.optionalStringList(row.scopeCategoryIds),
      applyMode: this.optionalApplyMode(row.applyMode),
      autoApply: this.optionalBoolean(row.autoApply),
      isActive: this.optionalBoolean(row.isActive),
    };
    const response = await this.adminPromotionsService.createPromotion(
      user,
      dto,
    );

    return {
      id: response.data.id,
      code: response.data.code ?? undefined,
    };
  }

  private async importHappyHour(
    user: AuthUserContext,
    row: Record<string, string>,
  ) {
    const dto: CreateAdminHappyHourDto = {
      restaurantId: this.optionalString(row.restaurantId),
      branchId: this.optionalString(row.branchId),
      code: this.optionalString(row.code),
      title: this.requiredString(row.title, 'title'),
      description: this.optionalString(row.description),
      imageUrl: this.optionalString(row.imageUrl),
      discountType: this.requiredPromotionDiscountType(row.discountType),
      discountValue: this.requiredNumber(row.discountValue, 'discountValue'),
      maxDiscountAmount: this.optionalNumber(row.maxDiscountAmount),
      minOrderAmount: this.optionalNumber(row.minOrderAmount),
      maxUses: this.optionalInteger(row.maxUses),
      maxUsesPerCustomer: this.optionalInteger(row.maxUsesPerCustomer),
      startsAt: this.requiredString(row.startsAt, 'startsAt'),
      expiresAt: this.requiredString(row.expiresAt, 'expiresAt'),
      activeDays: this.requiredIntegerList(row.activeDays, 'activeDays'),
      dailyStartTime: this.requiredString(row.dailyStartTime, 'dailyStartTime'),
      dailyEndTime: this.requiredString(row.dailyEndTime, 'dailyEndTime'),
      scopeMenuItemId: this.optionalString(row.scopeMenuItemId),
      scopeCategoryId: this.optionalString(row.scopeCategoryId),
      scopeMenuItemIds: this.optionalStringList(row.scopeMenuItemIds),
      scopeCategoryIds: this.optionalStringList(row.scopeCategoryIds),
      applyMode: this.optionalApplyMode(row.applyMode),
      autoApply: this.optionalBoolean(row.autoApply),
      isActive: this.optionalBoolean(row.isActive),
    };
    const response = await this.adminPromotionsService.createHappyHour(
      user,
      dto,
    );

    return {
      id: response.data.id,
      code: response.data.code ?? undefined,
    };
  }

  private parseImportType(type: string): AdminImportType {
    if (
      type === 'deliverymen' ||
      type === 'coupons' ||
      type === 'promotions' ||
      type === 'happy-hours'
    ) {
      return type;
    }

    throw new BadRequestException(
      'Unsupported import type. Use deliverymen, coupons, promotions, or happy-hours',
    );
  }

  private parseCsvFile(file?: UploadedCsvFile): ParsedImportRow[] {
    if (!file?.buffer?.length) {
      throw new BadRequestException('CSV file is required');
    }

    const content = file.buffer.toString('utf8').replace(/^\uFEFF/, '');
    const records = this.parseCsv(content);

    if (records.length < 2) {
      throw new BadRequestException('CSV file must include headers and rows');
    }

    const headers = records[0].map((header) => header.trim());
    if (headers.some((header) => !header)) {
      throw new BadRequestException('CSV headers cannot be empty');
    }

    return records
      .slice(1)
      .filter((record) => record.some((value) => value.trim().length > 0))
      .map((record, index) => ({
        rowNumber: index + 2,
        data: headers.reduce<Record<string, string>>((row, header, column) => {
          row[header] = record[column]?.trim() ?? '';
          return row;
        }, {}),
      }));
  }

  private parseCsv(content: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let inQuotes = false;

    for (let index = 0; index < content.length; index += 1) {
      const char = content[index];
      const next = content[index + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === ',' && !inQuotes) {
        row.push(cell);
        cell = '';
        continue;
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') {
          index += 1;
        }
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        continue;
      }

      cell += char;
    }

    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }

    return rows;
  }

  private requiredString(value: string | undefined, field: string) {
    const normalized = this.optionalString(value);
    if (!normalized) {
      throw new BadRequestException(`${field} is required`);
    }

    return normalized;
  }

  private optionalString(value: string | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private optionalBoolean(value: string | undefined) {
    const normalized = value?.trim().toLowerCase();

    if (!normalized) {
      return undefined;
    }

    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return false;
    }

    throw new BadRequestException(`Invalid boolean value: ${value}`);
  }

  private requiredNumber(value: string | undefined, field: string) {
    const parsed = this.optionalNumber(value);
    if (parsed === undefined) {
      throw new BadRequestException(`${field} is required`);
    }

    return parsed;
  }

  private optionalNumber(value: string | undefined) {
    const normalized = this.optionalString(value);
    if (!normalized) {
      return undefined;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(`Invalid number value: ${value}`);
    }

    return parsed;
  }

  private optionalInteger(value: string | undefined) {
    const parsed = this.optionalNumber(value);
    if (parsed === undefined) {
      return undefined;
    }

    if (!Number.isInteger(parsed)) {
      throw new BadRequestException(`Invalid integer value: ${value}`);
    }

    return parsed;
  }

  private optionalStringList(value: string | undefined) {
    const normalized = this.optionalString(value);
    if (!normalized) {
      return undefined;
    }

    return normalized
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private requiredIntegerList(value: string | undefined, field: string) {
    const values = this.optionalStringList(value);
    if (!values?.length) {
      throw new BadRequestException(`${field} is required`);
    }

    return values.map((item) => {
      const parsed = Number(item);
      if (!Number.isInteger(parsed)) {
        throw new BadRequestException(`Invalid integer value: ${item}`);
      }

      return parsed;
    });
  }

  private optionalDeliverymanStatus(value: string | undefined) {
    const normalized = this.optionalString(value);

    if (!normalized) {
      return undefined;
    }

    if (this.isDeliverymanStatus(normalized)) {
      return normalized;
    }

    throw new BadRequestException(`Invalid deliveryman status: ${value}`);
  }

  private isDeliverymanStatus(value: string): value is DeliverymanStatus {
    return Object.values(DeliverymanStatus).includes(
      value as DeliverymanStatus,
    );
  }

  private requiredDiscountType(value: string | undefined) {
    const normalized = this.requiredString(value, 'discountType');
    if (this.isCouponDiscountType(normalized)) {
      return normalized;
    }

    throw new BadRequestException(`Invalid discount type: ${value}`);
  }

  private requiredPromotionDiscountType(value: string | undefined) {
    const discountType = this.requiredDiscountType(value);
    return discountType as 'FLAT' | 'PERCENTAGE' | 'FIXED_PRICE';
  }

  private isCouponDiscountType(value: string): value is CouponDiscountType {
    return Object.values(CouponDiscountType).includes(
      value as CouponDiscountType,
    );
  }

  private optionalApplyMode(value: string | undefined) {
    const normalized = this.optionalString(value);
    if (!normalized) {
      return undefined;
    }

    if (normalized === 'ORDER_TOTAL' || normalized === 'SCOPED_ITEMS') {
      return normalized;
    }

    throw new BadRequestException(`Invalid apply mode: ${value}`);
  }

  private importTypeLabel(type: AdminImportType) {
    if (type === 'deliverymen') {
      return 'Deliveryman';
    }

    if (type === 'happy-hours') {
      return 'Happy hour';
    }

    return type === 'coupons' ? 'Coupon' : 'Promotion';
  }
}
