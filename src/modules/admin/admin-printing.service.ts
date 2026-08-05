import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { SystemHealthMetricsService } from '../system-health/system-health-metrics.service';
import {
  AdminPrintingLogsQueryDto,
  AdminPrintingScopedQueryDto,
  AdminPrintingStatusQueryDto,
  ReportAdminPrinterEventDto,
  UpdateAdminPrintingSettingsDto,
} from './dto';
import {
  AdminPrintingRepository,
  AdminPrintingScope,
} from './admin-printing.repository';

type PrintingConnectionType = 'USB' | 'LAN' | 'BLUETOOTH' | 'CLOUD';
type PrintingPaperSize = 'A4' | 'A5' | '80MM' | '58MM';

type PrintingConfig = {
  enabled: boolean;
  autoPrintOnNewOrder: boolean;
  autoPrintOnStatusChange: boolean;
  printCustomerReceipt: boolean;
  printKitchenTicket: boolean;
  connectionType: PrintingConnectionType | null;
  paperSize: PrintingPaperSize;
  printerName: string | null;
  printerTarget: string | null;
  deviceId: string | null;
  ipAddress: string | null;
  queueName: string | null;
};

type PrinterLogItem = {
  id: string;
  type: 'printer';
  status: 'success' | 'failed' | 'warning';
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
};

@Injectable()
export class AdminPrintingService {
  constructor(
    private readonly adminPrintingRepository: AdminPrintingRepository,
    private readonly systemHealthMetricsService: SystemHealthMetricsService,
  ) {}

  async getSettings(user: AuthUserContext, query: AdminPrintingScopedQueryDto) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const { restaurant, branch } = await this.getScopedSettings(scope);
    const restaurantConfig = this.extractPrintingConfig(restaurant?.settings);
    const branchConfig = branch
      ? this.extractPrintingConfig(branch.settings, restaurantConfig)
      : null;

    return {
      data: {
        scope: this.toScopeResponse(scope),
        settings: branchConfig ?? restaurantConfig,
        source: scope.branchId ? 'branch' : 'restaurant',
        inheritedFromRestaurant: scope.branchId
          ? !this.hasPrintingConfig(branch?.settings)
          : false,
      },
      message: 'Admin printing settings fetched successfully',
    };
  }

  async updateSettings(
    user: AuthUserContext,
    query: AdminPrintingScopedQueryDto,
    dto: UpdateAdminPrintingSettingsDto,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const hasUpdates = Object.values(dto).some((value) => value !== undefined);

    if (!hasUpdates) {
      throw new BadRequestException(
        'At least one printing setting field is required',
      );
    }

    if (scope.branchId) {
      const branch = await this.adminPrintingRepository.getBranchWithSettings(
        scope.branchId,
      );
      if (!branch) {
        throw new NotFoundException('Branch not found');
      }

      const restaurant =
        await this.adminPrintingRepository.getRestaurantWithSettings(
          branch.restaurantId,
        );
      const nextSettings = this.mergePrintingConfig(branch.settings, dto);
      this.assertValidPrintingConfig(
        this.extractPrintingConfig(
          nextSettings,
          this.extractPrintingConfig(restaurant?.settings),
        ),
      );
      await this.adminPrintingRepository.updateBranchSettings(
        branch.id,
        nextSettings,
      );
    } else if (scope.restaurantId) {
      const restaurant =
        await this.adminPrintingRepository.getRestaurantWithSettings(
          scope.restaurantId,
        );
      if (!restaurant) {
        throw new NotFoundException('Restaurant not found');
      }

      const nextSettings = this.mergePrintingConfig(restaurant.settings, dto);
      this.assertValidPrintingConfig(this.extractPrintingConfig(nextSettings));
      await this.adminPrintingRepository.updateRestaurantSettings(
        restaurant.id,
        nextSettings,
      );
    } else {
      throw new BadRequestException(
        'restaurantId or branchId is required for printing settings',
      );
    }

    return this.getSettings(user, query);
  }

  async reportEvent(
    user: AuthUserContext,
    query: AdminPrintingScopedQueryDto,
    dto: ReportAdminPrinterEventDto,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );

    this.systemHealthMetricsService.recordIntegrationLog('printer', {
      status: dto.status,
      message: dto.message.trim(),
      meta: {
        tenantId: scope.tenantId,
        restaurantId: scope.restaurantId,
        ...(scope.branchId ? { branchId: scope.branchId } : {}),
        event: dto.event,
        ...(dto.printerName?.trim()
          ? { printerName: dto.printerName.trim() }
          : {}),
      },
    });

    return {
      data: { recorded: true },
      message: 'Admin printer event recorded successfully',
    };
  }

  async getStatus(user: AuthUserContext, query: AdminPrintingStatusQueryDto) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const { restaurant, branch } = await this.getScopedSettings(scope);
    const restaurantConfig = this.extractPrintingConfig(restaurant?.settings);
    const effectiveSettings = branch
      ? this.extractPrintingConfig(branch.settings, restaurantConfig)
      : restaurantConfig;
    const logs = this.filterLogsByScope(this.readPrinterLogs(100), scope);
    const latestSuccess =
      logs.find((item) => item.status === 'success') ?? null;
    const latestFailure = logs.find((item) => item.status === 'failed') ?? null;
    const latestWarning =
      logs.find((item) => item.status === 'warning') ?? null;
    const latest = logs[0] ?? null;

    return {
      data: {
        scope: this.toScopeResponse(scope),
        settings: effectiveSettings,
        source: scope.branchId ? 'branch' : 'restaurant',
        inheritedFromRestaurant: scope.branchId
          ? !this.hasPrintingConfig(branch?.settings)
          : false,
        health: {
          status: latest?.status ?? 'tracking_pending',
          totalEvents: logs.length,
          successCount: logs.filter((item) => item.status === 'success').length,
          failedCount: logs.filter((item) => item.status === 'failed').length,
          warningCount: logs.filter((item) => item.status === 'warning').length,
          latest,
          latestSuccess,
          latestFailure,
          latestWarning,
          latestErrorMessage: latestFailure?.message ?? null,
        },
      },
      message: 'Admin printing status fetched successfully',
    };
  }

  async getLogs(user: AuthUserContext, query: AdminPrintingLogsQueryDto) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const filtered = this.filterLogsByScope(
      this.readPrinterLogs(1000),
      scope,
    ).filter((item) => {
      if (query.status && item.status !== query.status) {
        return false;
      }

      const occurredAt = new Date(item.timestamp).getTime();
      if (query.fromDate && occurredAt < new Date(query.fromDate).getTime()) {
        return false;
      }

      if (query.toDate && occurredAt > new Date(query.toDate).getTime()) {
        return false;
      }

      return true;
    });

    return {
      data: {
        scope: this.toScopeResponse(scope),
        items: filtered.slice(0, query.limit),
        total: filtered.length,
      },
      message: 'Admin printing logs fetched successfully',
    };
  }

  private async resolveScope(
    user: AuthUserContext,
    requestedRestaurantId?: string,
    requestedBranchId?: string,
  ): Promise<AdminPrintingScope> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (requestedBranchId) {
        const branch =
          await this.adminPrintingRepository.findBranchScope(requestedBranchId);
        if (!branch) {
          throw new NotFoundException('Branch not found');
        }
        if (
          requestedRestaurantId &&
          requestedRestaurantId !== branch.restaurantId
        ) {
          throw new BadRequestException(
            'branchId does not belong to the provided restaurantId',
          );
        }

        return {
          tenantId: branch.tenantId,
          restaurantId: branch.restaurantId,
          branchId: branch.id,
        };
      }

      if (requestedRestaurantId) {
        const restaurant =
          await this.adminPrintingRepository.findRestaurantScope(
            requestedRestaurantId,
          );
        if (!restaurant) {
          throw new NotFoundException('Restaurant not found');
        }

        return {
          tenantId: restaurant.tenantId,
          restaurantId: restaurant.id,
        };
      }

      throw new BadRequestException('restaurantId or branchId is required');
    }

    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.rid || !user.bid) {
        throw new ForbiddenException('Branch context is required');
      }

      if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
        throw new ForbiddenException(
          'You cannot access resources outside your restaurant',
        );
      }

      if (requestedBranchId && requestedBranchId !== user.bid) {
        throw new ForbiddenException(
          'You cannot access resources outside your branch',
        );
      }

      return {
        tenantId: user.tid,
        restaurantId: user.rid,
        branchId: user.bid,
      };
    }

    if (requestedBranchId) {
      const branch = await this.adminPrintingRepository.findBranchScope(
        requestedBranchId,
        user.tid,
        user.rid,
      );
      if (!branch) {
        throw new ForbiddenException(
          'You cannot access resources outside your tenant restaurants',
        );
      }
      if (
        requestedRestaurantId &&
        requestedRestaurantId !== branch.restaurantId
      ) {
        throw new BadRequestException(
          'branchId does not belong to the provided restaurantId',
        );
      }

      return {
        tenantId: user.tid,
        restaurantId: branch.restaurantId,
        branchId: branch.id,
      };
    }

    if (user.rid) {
      if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
        throw new ForbiddenException(
          'You cannot access resources outside your restaurant',
        );
      }

      return {
        tenantId: user.tid,
        restaurantId: user.rid,
      };
    }

    if (requestedRestaurantId) {
      const restaurant = await this.adminPrintingRepository.findRestaurantScope(
        requestedRestaurantId,
        user.tid,
      );
      if (!restaurant) {
        throw new ForbiddenException(
          'You cannot access resources outside your tenant restaurants',
        );
      }

      return {
        tenantId: user.tid,
        restaurantId: restaurant.id,
      };
    }

    throw new BadRequestException('restaurantId or branchId is required');
  }

  private async getScopedSettings(scope: AdminPrintingScope) {
    const restaurant = scope.restaurantId
      ? await this.adminPrintingRepository.getRestaurantWithSettings(
          scope.restaurantId,
        )
      : null;
    const branch = scope.branchId
      ? await this.adminPrintingRepository.getBranchWithSettings(scope.branchId)
      : null;

    return {
      restaurant,
      branch,
    };
  }

  private readPrinterLogs(limit: number): PrinterLogItem[] {
    return this.systemHealthMetricsService.getIntegrationLogs('printer', limit)
      .items as PrinterLogItem[];
  }

  private filterLogsByScope(logs: PrinterLogItem[], scope: AdminPrintingScope) {
    return logs.filter((item) => {
      const meta = this.asObject(item.meta);
      const metaBranchId = this.readStringValue(meta.branchId);
      const metaRestaurantId = this.readStringValue(meta.restaurantId);
      const metaTenantId = this.readStringValue(meta.tenantId);

      if (scope.branchId) {
        return (
          metaBranchId === scope.branchId &&
          (!metaRestaurantId || metaRestaurantId === scope.restaurantId) &&
          (!metaTenantId || metaTenantId === scope.tenantId)
        );
      }

      if (scope.restaurantId) {
        return (
          !metaBranchId &&
          metaRestaurantId === scope.restaurantId &&
          (!metaTenantId || metaTenantId === scope.tenantId)
        );
      }

      if (scope.tenantId) {
        return (
          !metaBranchId && !metaRestaurantId && metaTenantId === scope.tenantId
        );
      }

      return false;
    });
  }

  private extractPrintingConfig(
    source: Prisma.JsonValue | null | undefined,
    fallback?: PrintingConfig,
  ): PrintingConfig {
    const printing = this.asObject(this.readPath(source, ['printing']));

    return {
      enabled:
        typeof printing.enabled === 'boolean'
          ? printing.enabled
          : (fallback?.enabled ?? false),
      autoPrintOnNewOrder:
        typeof printing.autoPrintOnNewOrder === 'boolean'
          ? printing.autoPrintOnNewOrder
          : (fallback?.autoPrintOnNewOrder ?? false),
      autoPrintOnStatusChange:
        typeof printing.autoPrintOnStatusChange === 'boolean'
          ? printing.autoPrintOnStatusChange
          : (fallback?.autoPrintOnStatusChange ?? false),
      printCustomerReceipt:
        typeof printing.printCustomerReceipt === 'boolean'
          ? printing.printCustomerReceipt
          : (fallback?.printCustomerReceipt ?? false),
      printKitchenTicket:
        typeof printing.printKitchenTicket === 'boolean'
          ? printing.printKitchenTicket
          : (fallback?.printKitchenTicket ?? false),
      connectionType: this.readConnectionType(
        printing.connectionType,
        fallback?.connectionType ?? null,
      ),
      paperSize: this.readPaperSize(
        printing.paperSize,
        fallback?.paperSize ?? '80MM',
      ),
      printerName:
        this.readStringValue(printing.printerName) ??
        fallback?.printerName ??
        null,
      printerTarget:
        this.readStringValue(printing.printerTarget) ??
        fallback?.printerTarget ??
        null,
      deviceId:
        this.readStringValue(printing.deviceId) ?? fallback?.deviceId ?? null,
      ipAddress:
        this.readStringValue(printing.ipAddress) ?? fallback?.ipAddress ?? null,
      queueName:
        this.readStringValue(printing.queueName) ?? fallback?.queueName ?? null,
    };
  }

  private assertValidPrintingConfig(config: PrintingConfig) {
    if (!config.connectionType) {
      if (config.enabled) {
        throw new BadRequestException(
          'connectionType is required when printing is enabled',
        );
      }
      return;
    }

    if (config.connectionType === 'CLOUD') {
      if (!config.queueName) {
        throw new BadRequestException(
          'queueName is required for cloud printing',
        );
      }
      return;
    }

    if (!config.printerName) {
      throw new BadRequestException(
        'printerName is required for local printing',
      );
    }
  }

  private mergePrintingConfig(
    currentSettings: Prisma.JsonValue | null | undefined,
    dto: UpdateAdminPrintingSettingsDto,
  ): Prisma.JsonObject {
    const root = this.asObject(currentSettings);
    const printing = this.asObject(root.printing);

    return {
      ...root,
      printing: {
        ...printing,
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.autoPrintOnNewOrder !== undefined
          ? { autoPrintOnNewOrder: dto.autoPrintOnNewOrder }
          : {}),
        ...(dto.autoPrintOnStatusChange !== undefined
          ? { autoPrintOnStatusChange: dto.autoPrintOnStatusChange }
          : {}),
        ...(dto.printCustomerReceipt !== undefined
          ? { printCustomerReceipt: dto.printCustomerReceipt }
          : {}),
        ...(dto.printKitchenTicket !== undefined
          ? { printKitchenTicket: dto.printKitchenTicket }
          : {}),
        ...(dto.connectionType !== undefined
          ? { connectionType: dto.connectionType }
          : {}),
        ...(dto.paperSize !== undefined ? { paperSize: dto.paperSize } : {}),
        ...(dto.printerName !== undefined
          ? { printerName: dto.printerName }
          : {}),
        ...(dto.printerTarget !== undefined
          ? { printerTarget: dto.printerTarget }
          : {}),
        ...(dto.deviceId !== undefined ? { deviceId: dto.deviceId } : {}),
        ...(dto.ipAddress !== undefined ? { ipAddress: dto.ipAddress } : {}),
        ...(dto.queueName !== undefined ? { queueName: dto.queueName } : {}),
      },
    } as Prisma.JsonObject;
  }

  private hasPrintingConfig(source: Prisma.JsonValue | null | undefined) {
    const printing = this.readPath(source, ['printing']);
    return (
      !!printing && typeof printing === 'object' && !Array.isArray(printing)
    );
  }

  private toScopeResponse(scope: AdminPrintingScope) {
    return {
      tenantId: scope.tenantId ?? null,
      restaurantId: scope.restaurantId ?? null,
      branchId: scope.branchId ?? null,
    };
  }

  private readConnectionType(
    value: unknown,
    fallback: PrintingConnectionType | null,
  ): PrintingConnectionType | null {
    if (
      value === 'USB' ||
      value === 'LAN' ||
      value === 'BLUETOOTH' ||
      value === 'CLOUD'
    ) {
      return value;
    }

    return fallback;
  }

  private readPaperSize(
    value: unknown,
    fallback: PrintingPaperSize,
  ): PrintingPaperSize {
    if (
      value === 'A4' ||
      value === 'A5' ||
      value === '80MM' ||
      value === '58MM'
    ) {
      return value;
    }

    return fallback;
  }

  private readPath(value: Prisma.JsonValue | null | undefined, path: string[]) {
    let current: unknown = value;

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

  private readStringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }
}
