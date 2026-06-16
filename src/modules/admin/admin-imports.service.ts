import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DeliverymanStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { PrismaService } from '../../database';
import { DeliverymenService } from '../deliverymen/deliverymen.service';
import { StaffManagementService } from '../staff-management/staff-management.service';
import { UsersService } from '../users/users.service';

export type AdminImportType = 'deliverymen' | 'employees' | 'customers';

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
  error?: string;
}

interface CustomerImportScope {
  tenantId: string;
  restaurantId: string;
  branchId?: string;
}

@Injectable()
export class AdminImportsService {
  constructor(
    private readonly deliverymenService: DeliverymenService,
    private readonly staffManagementService: StaffManagementService,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
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
  ) {
    if (type === 'deliverymen') {
      return this.importDeliveryman(user, row);
    }

    if (type === 'employees') {
      return this.importEmployee(user, row);
    }

    return this.importCustomer(user, row);
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

  private async importEmployee(
    user: AuthUserContext,
    row: Record<string, string>,
  ) {
    const response = await this.staffManagementService.create(user, {
      email: this.requiredString(row.email, 'email'),
      password: this.requiredString(row.password, 'password'),
      firstName: this.requiredString(row.firstName, 'firstName'),
      lastName: this.requiredString(row.lastName, 'lastName'),
      phone: this.optionalString(row.phone),
      avatarUrl: this.optionalString(row.avatarUrl),
      bio: this.optionalString(row.bio),
      staffRoleId: this.requiredString(row.staffRoleId, 'staffRoleId'),
      isActive: this.optionalBoolean(row.isActive),
    });
    const employee = response.data as unknown as { id: string; email: string };

    return {
      id: employee.id,
      email: employee.email,
    };
  }

  private async importCustomer(
    user: AuthUserContext,
    row: Record<string, string>,
  ) {
    const scope = await this.resolveCustomerImportScope(
      user,
      this.optionalString(row.restaurantId),
      this.optionalString(row.branchId),
    );
    const email = this.requiredString(row.email, 'email').toLowerCase();
    const existing = await this.usersService.findByEmailIncludingDeleted(
      email,
      scope.restaurantId,
    );

    if (existing && !existing.deletedAt) {
      throw new BadRequestException(
        'A customer with this email already exists in this restaurant',
      );
    }

    const customer = await this.usersService.create({
      email,
      password: await bcrypt.hash(
        this.requiredString(row.password, 'password'),
        10,
      ),
      role: UserRoleEnum.CUSTOMER,
      tenantId: scope.tenantId,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
      isVerified: this.optionalBoolean(row.isVerified) ?? true,
      isApproved: true,
      isGuest: false,
      profile: {
        firstName: this.requiredString(row.firstName, 'firstName'),
        lastName: this.requiredString(row.lastName, 'lastName'),
        phone: this.optionalString(row.phone),
        avatarUrl: this.optionalString(row.avatarUrl),
        bio: this.optionalString(row.bio),
      },
    });

    return {
      id: customer.id,
      email: customer.email,
    };
  }

  private parseImportType(type: string): AdminImportType {
    if (
      type === 'deliverymen' ||
      type === 'employees' ||
      type === 'customers'
    ) {
      return type;
    }

    throw new BadRequestException(
      'Unsupported import type. Use deliverymen, employees, or customers',
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

  private async resolveCustomerImportScope(
    user: AuthUserContext,
    restaurantId?: string,
    branchId?: string,
  ): Promise<CustomerImportScope> {
    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.tid || !user.rid || !user.bid) {
        throw new ForbiddenException('Branch context is required');
      }

      if (restaurantId && restaurantId !== user.rid) {
        throw new ForbiddenException(
          'You cannot import customers outside your restaurant',
        );
      }

      if (branchId && branchId !== user.bid) {
        throw new ForbiddenException(
          'You cannot import customers outside your branch',
        );
      }

      return {
        tenantId: user.tid,
        restaurantId: user.rid,
        branchId: user.bid,
      };
    }

    const resolvedRestaurantId = restaurantId;
    if (!resolvedRestaurantId) {
      throw new BadRequestException('restaurantId is required');
    }

    const restaurant = await this.prisma.restaurant.findFirst({
      where: {
        id: resolvedRestaurantId,
        deletedAt: null,
        ...(user.role === UserRoleEnum.SUPER_ADMIN
          ? {}
          : { tenantId: user.tid }),
      },
      select: { id: true, tenantId: true },
    });

    if (!restaurant) {
      throw new ForbiddenException('Restaurant is not accessible');
    }

    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: branchId,
          restaurantId: restaurant.id,
          tenantId: restaurant.tenantId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!branch) {
        throw new BadRequestException(
          'branchId does not belong to restaurantId',
        );
      }
    }

    return {
      tenantId: restaurant.tenantId,
      restaurantId: restaurant.id,
      branchId,
    };
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

  private importTypeLabel(type: AdminImportType) {
    return type === 'deliverymen'
      ? 'Deliveryman'
      : type === 'employees'
        ? 'Employee'
        : 'Customer';
  }
}
