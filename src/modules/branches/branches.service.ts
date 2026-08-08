import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Branch, PaymentMethod, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { PrismaTx } from '../../common/types';
import {
  buildPaginationMeta,
  resolveAvailablePaymentMethods,
} from '../../common/utils';
import { UsersService } from '../users/users.service';
import { StorageService } from '../storage/storage.service';
import { BranchesRepository } from './branches.repository';
import {
  BranchOpeningHourBreakDto,
  BranchOpeningHourItemDto,
  BranchHolidayOpeningHourItemDto,
  BranchScheduleDayEnum,
  BulkCreateBranchesDto,
  CleanupOrphanBranchDto,
  CreateBranchDto,
  ListBranchesDto,
  ListPublicBranchesDto,
  UpdateBranchDto,
  UpdateBranchDeliveryHoursDto,
  UpdateBranchDeliveryTimeDto,
  UpdateBranchImagesDto,
  UpdateBranchHolidayOpeningHoursDto,
  UpdateBranchNotificationSettingsDto,
  UpdateBranchOpeningHoursDto,
  UpdateBranchTemporaryClosureDto,
} from './dto';

interface BranchDistanceAddress {
  referenceId: string;
  lat: Prisma.Decimal | null;
  lng: Prisma.Decimal | null;
  street: string;
  area: string | null;
  postalCode: string | null;
  city: string;
  state: string;
  country: string;
}

interface DistanceOrigin {
  lat: number;
  lng: number;
}

export interface BranchTemporaryClosure {
  isClosed: boolean;
  closedAt?: string | null;
  closedUntil?: string | null;
  reason?: string | null;
  message?: string | null;
}

export interface NormalizedBranchHolidayOpeningHour extends BranchHolidayOpeningHourItemDto {
  date?: string;
  fromDate?: string;
  toDate?: string;
}

interface BranchSettingsLike {
  openingHours?: BranchOpeningHourItemDto[];
  deliveryHours?: BranchOpeningHourItemDto[];
  holidayOpeningHours?: NormalizedBranchHolidayOpeningHour[];
  temporaryClosure?: BranchTemporaryClosure;
  [key: string]: unknown;
}

interface StaffBranchAccessScope {
  restaurantIds: string[];
  branchIds: string[];
  allRestaurants: boolean;
}

interface BranchAdminUpdateTarget {
  id: string;
  tenantId: string;
  restaurantId: string;
  managerId?: string | null;
  manager?: {
    id: string;
    email: string;
    profile?: {
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
    } | null;
  } | null;
}

const BRANCH_OPENING_DAY_ORDER: BranchScheduleDayEnum[] = [
  BranchScheduleDayEnum.MONDAY,
  BranchScheduleDayEnum.TUESDAY,
  BranchScheduleDayEnum.WEDNESDAY,
  BranchScheduleDayEnum.THURSDAY,
  BranchScheduleDayEnum.FRIDAY,
  BranchScheduleDayEnum.SATURDAY,
  BranchScheduleDayEnum.SUNDAY,
];

@Injectable()
export class BranchesService {
  constructor(
    private readonly branchesRepository: BranchesRepository,
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
  ) {}

  async create(tenantId: string, dto: CreateBranchDto, tx?: PrismaTx) {
    if (!dto.restaurantId) {
      throw new BadRequestException('restaurantId is required');
    }

    this.assertValidDeliveryConfiguration(dto.settings);
    await this.assertRestaurantPaymentMethods(
      dto.restaurantId,
      dto.settings?.allowedPaymentMethods,
      tx,
    );

    return this.branchesRepository.create(
      {
        tenantId,
        restaurantId: dto.restaurantId,
        name: dto.name,
        isMain: dto.isMain,
        street: dto.street,
        area: this.resolveShopNumber(dto),
        postalCode: dto.postalCode,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        lat: dto.lat,
        lng: dto.lng,
        logoUrl: this.normalizeMediaUrl(dto.logoUrl),
        coverImage: this.normalizeMediaUrl(dto.coverImage),
        description: dto.description,
        settings: dto.settings as unknown as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  async createFromUser(
    user: AuthUserContext,
    dto: CreateBranchDto,
    tx?: PrismaTx,
  ) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const effectiveRestaurantId = this.resolveScopedRestaurantId(
      user,
      dto.restaurantId,
    );
    const branchDto: CreateBranchDto = {
      ...dto,
      restaurantId: effectiveRestaurantId,
      settings: this.sanitizeBranchSettingsInput(
        user,
        dto.settings,
      ) as CreateBranchDto['settings'],
    };

    if (!dto.branchAdmin) {
      const data = await this.create(user.tid, branchDto, tx);
      return {
        data: await this.resolveBranchMedia(
          this.withVisibleBranchSettings(user, data),
        ),
        message: 'Branch created successfully',
      };
    }

    const existingBranchAdmin = await this.usersService.findByEmail(
      dto.branchAdmin.email,
      effectiveRestaurantId,
    );

    if (existingBranchAdmin) {
      throw new BadRequestException(
        'Branch admin already exists for this restaurant',
      );
    }

    const branchAdminInput = dto.branchAdmin;
    const plainPassword =
      branchAdminInput.password ?? this.generateBranchAdminPassword();

    const operation = async (trx: PrismaTx) => {
      const branch = await this.create(user.tid as string, branchDto, trx);

      const branchAdmin = await this.usersService.create(
        {
          email: branchAdminInput.email,
          password: await bcrypt.hash(plainPassword, 10),
          role: UserRoleEnum.BRANCH_ADMIN,
          tenantId: user.tid,
          restaurantId: effectiveRestaurantId,
          branchId: branch.id,
          isVerified: true,
          isApproved: true,
          profile: {
            firstName: branchAdminInput.firstName,
            lastName: branchAdminInput.lastName,
            phone: branchAdminInput.phone,
          },
        },
        trx,
      );

      await this.branchesRepository.update(
        branch.id,
        {
          manager: {
            connect: {
              id: branchAdmin.id,
            },
          },
        },
        trx,
      );

      return {
        branch,
        branchAdmin,
      };
    };

    const result = tx
      ? await operation(tx)
      : await this.branchesRepository.transaction(operation);

    return {
      data: {
        ...result,
        branch: this.withVisibleBranchSettings(user, result.branch),
        branchAdminCredentials: {
          email: result.branchAdmin.email,
          password: plainPassword,
        },
      },
      message: 'Branch and branch user created successfully',
    };
  }

  async createBulkFromUser(user: AuthUserContext, dto: BulkCreateBranchesDto) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    if (!dto.branches || dto.branches.length === 0) {
      throw new BadRequestException('At least one branch is required');
    }

    const effectiveRestaurantId = this.resolveScopedRestaurantId(
      user,
      dto.restaurantId,
    );

    const createdBranches = await this.branchesRepository.transaction(
      async (trx) => {
        const results: Branch[] = [];

        for (const item of dto.branches) {
          const branchInput: CreateBranchDto = {
            ...item,
            restaurantId: effectiveRestaurantId,
            settings: this.sanitizeBranchSettingsInput(
              user,
              item.settings,
            ) as CreateBranchDto['settings'],
          };

          const branch = await this.create(
            user.tid as string,
            branchInput,
            trx,
          );
          results.push(branch);
        }

        return results;
      },
    );

    return {
      data: createdBranches.map((branch) =>
        this.withVisibleBranchSettings(user, branch),
      ),
      message: 'Branches created successfully',
      meta: {
        totalCreated: createdBranches.length,
      },
    };
  }

  async list(user: AuthUserContext, query: ListBranchesDto) {
    const nearestOrigin = this.resolveNearestOrigin(query);

    if (this.isStaff(user)) {
      const staffAccess = await this.resolveStaffBranchAccess(user, 'read');
      const effectiveRestaurantId = this.resolveStaffRestaurantId(
        staffAccess,
        query.restaurantId,
      );
      const effectiveTenantId =
        await this.branchesRepository.findTenantIdByRestaurant(
          effectiveRestaurantId,
        );

      if (!effectiveTenantId) {
        throw new ForbiddenException('Restaurant context is invalid');
      }

      const scopedQuery = { ...query, restaurantId: effectiveRestaurantId };
      const { items } = await this.branchesRepository.listByRestaurant(
        effectiveTenantId,
        effectiveRestaurantId,
        scopedQuery,
        false,
        false,
        false,
      );
      const scopedItems = staffAccess.branchIds.length
        ? items.filter((item) => staffAccess.branchIds.includes(item.id))
        : items;
      const data = nearestOrigin
        ? await this.attachDistanceAndPaginate(
            scopedItems,
            { page: query.page, limit: query.limit },
            nearestOrigin,
          )
        : {
            items: await this.attachBranchAddresses(scopedItems, null),
            total: scopedItems.length,
          };

      return {
        data: await Promise.all(
          data.items.map((item) =>
            this.withBranchDeletionState(
              this.withVisibleBranchSettings(user, item),
            ),
          ),
        ),
        message: 'Branches fetched successfully',
        meta: buildPaginationMeta(query, data.total),
      };
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN && user.bid) {
      const items = await this.branchesRepository.listByBranchId(user.bid);
      const data = await this.attachDistanceAndPaginate(
        items,
        { page: query.page, limit: query.limit },
        nearestOrigin,
      );

      return {
        data: data.items.map((item) =>
          this.withVisibleBranchSettings(user, item),
        ),
        message: 'Branch admin scope applied',
        meta: buildPaginationMeta(query, data.total),
      };
    }

    const roleScopedRestaurantId =
      user.role === UserRoleEnum.BRANCH_ADMIN ||
      user.role === UserRoleEnum.CUSTOMER
        ? user.rid
        : undefined;

    if (
      roleScopedRestaurantId &&
      query.restaurantId &&
      query.restaurantId !== roleScopedRestaurantId
    ) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }

    const effectiveRestaurantId = roleScopedRestaurantId ?? query.restaurantId;

    const effectiveTenantId =
      user.role === UserRoleEnum.SUPER_ADMIN
        ? effectiveRestaurantId
          ? await this.branchesRepository.findTenantIdByRestaurant(
              effectiveRestaurantId,
            )
          : undefined
        : user.tid;

    if (
      user.role !== UserRoleEnum.SUPER_ADMIN &&
      user.role !== UserRoleEnum.BUSINESS_ADMIN &&
      (!effectiveTenantId || !effectiveRestaurantId)
    ) {
      throw new ForbiddenException('Restaurant context is required');
    }

    if (
      user.role === UserRoleEnum.BUSINESS_ADMIN &&
      effectiveRestaurantId &&
      !effectiveTenantId
    ) {
      throw new ForbiddenException('Restaurant context is invalid');
    }

    if (effectiveRestaurantId && !effectiveTenantId) {
      throw new ForbiddenException('Restaurant context is invalid');
    }

    const allowWithDeleted =
      user.role === UserRoleEnum.SUPER_ADMIN && !!query.withDeleted;
    const includeInactive =
      (user.role === UserRoleEnum.SUPER_ADMIN ||
        user.role === UserRoleEnum.BUSINESS_ADMIN ||
        user.role === UserRoleEnum.BRANCH_ADMIN) &&
      !!query.includeInactive;

    if (nearestOrigin) {
      const { items } = await this.branchesRepository.listAllByRestaurant(
        effectiveTenantId,
        effectiveRestaurantId,
        query,
        false,
        allowWithDeleted,
        includeInactive,
      );
      const data = await this.attachDistanceAndPaginate(
        items,
        { page: query.page, limit: query.limit },
        nearestOrigin,
      );

      return {
        data: await Promise.all(
          data.items.map((item) =>
            this.withBranchDeletionState(
              this.withVisibleBranchSettings(user, item),
            ),
          ),
        ),
        message: 'Branches fetched successfully',
        meta: buildPaginationMeta(query, data.total),
      };
    }

    const { items, total } = await this.branchesRepository.listByRestaurant(
      effectiveTenantId,
      effectiveRestaurantId,
      query,
      false,
      allowWithDeleted,
      includeInactive,
    );

    return {
      data: await Promise.all(
        (await this.attachBranchAddresses(items, null)).map((item) =>
          this.withBranchDeletionState(
            this.withVisibleBranchSettings(user, item),
          ),
        ),
      ),
      message: 'Branches fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  private isStaff(user: AuthUserContext) {
    return (
      user.actorType === 'STAFF' ||
      user.role === UserRoleEnum.STAFF ||
      Boolean(user.staffRoleId)
    );
  }

  private async resolveStaffBranchAccess(
    user: AuthUserContext,
    operation: 'read' | 'write' | 'create' | 'update' | 'delete',
  ): Promise<StaffBranchAccessScope> {
    if (!user.uid) {
      throw new ForbiddenException('Staff authentication is required');
    }

    const staff = await this.branchesRepository.findStaffBranchAccess(user.uid);

    if (
      !staff ||
      staff.deletedAt ||
      !staff.isActive ||
      !staff.staffRole ||
      staff.staffRole.deletedAt ||
      !staff.staffRole.isActive
    ) {
      throw new ForbiddenException('Staff account is inactive');
    }

    this.assertStaffBranchPermission(staff.staffRole.permissions, operation);

    return this.resolveStaffAccessScope(
      staff.restaurantAccess,
      staff.staffRole.restaurantAccess,
      staff.restaurantId,
      staff.branchId,
    );
  }

  private assertStaffBranchPermission(
    permissions: Prisma.JsonValue,
    operation: 'read' | 'write' | 'create' | 'update' | 'delete',
  ) {
    if (!Array.isArray(permissions)) {
      throw new ForbiddenException('Staff role does not allow branch access');
    }

    const requiredOperations =
      operation === 'read'
        ? ['read', 'list', 'view', '*']
        : [operation, 'write', 'manage', '*'];
    const allowedAccesses = new Set([
      '*',
      'branches',
      'branch-management',
      'branch_management',
    ]);
    const canAccess = permissions.some((permission) => {
      if (
        !permission ||
        typeof permission !== 'object' ||
        Array.isArray(permission)
      ) {
        return false;
      }

      const access = (permission as { access?: unknown }).access;
      const operations = (permission as { operations?: unknown }).operations;
      if (typeof access !== 'string' || !Array.isArray(operations)) {
        return false;
      }

      const normalizedAccess = access.trim().toLowerCase();
      const normalizedOperations = operations
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().toLowerCase());

      return (
        allowedAccesses.has(normalizedAccess) &&
        requiredOperations.some((required) =>
          normalizedOperations.includes(required),
        )
      );
    });

    if (!canAccess) {
      throw new ForbiddenException('Staff role does not allow branch access');
    }
  }

  private resolveStaffAccessScope(
    staffAccess: Prisma.JsonValue | null,
    roleAccess: Prisma.JsonValue | null,
    restaurantId?: string | null,
    branchId?: string | null,
  ): StaffBranchAccessScope {
    const parsedStaffAccess = this.normalizeStaffAccess(staffAccess);
    const parsedRoleAccess = this.normalizeStaffAccess(roleAccess);
    const allRestaurants =
      parsedStaffAccess.allRestaurants || parsedRoleAccess.allRestaurants;
    const restaurantIds = parsedStaffAccess.restaurantIds.length
      ? parsedStaffAccess.restaurantIds
      : parsedRoleAccess.restaurantIds;
    const branchIds = parsedStaffAccess.branchIds.length
      ? parsedStaffAccess.branchIds
      : parsedRoleAccess.branchIds;

    return {
      allRestaurants,
      restaurantIds: restaurantIds.length
        ? restaurantIds
        : restaurantId
          ? [restaurantId]
          : [],
      branchIds: branchIds.length ? branchIds : branchId ? [branchId] : [],
    };
  }

  private normalizeStaffAccess(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { restaurantIds: [], branchIds: [], allRestaurants: false };
    }

    const raw = value as {
      restaurantIds?: unknown;
      branchIds?: unknown;
      allRestaurants?: unknown;
      hasAllRestaurantsAccess?: unknown;
    };
    return {
      allRestaurants:
        raw.allRestaurants === true || raw.hasAllRestaurantsAccess === true,
      restaurantIds: Array.isArray(raw.restaurantIds)
        ? raw.restaurantIds.filter(
            (item): item is string => typeof item === 'string',
          )
        : [],
      branchIds: Array.isArray(raw.branchIds)
        ? raw.branchIds.filter(
            (item): item is string => typeof item === 'string',
          )
        : [],
    };
  }

  private resolveStaffRestaurantId(
    access: StaffBranchAccessScope,
    requestedRestaurantId?: string,
  ) {
    const restaurantId = requestedRestaurantId ?? access.restaurantIds[0];

    if (!restaurantId) {
      throw new ForbiddenException('Staff restaurant access is required');
    }

    if (
      !access.allRestaurants &&
      !access.restaurantIds.includes(restaurantId)
    ) {
      throw new ForbiddenException(
        'Staff account is not assigned to this restaurant',
      );
    }

    return restaurantId;
  }

  async listPublic(query: ListPublicBranchesDto) {
    if (!query.restaurantId) {
      throw new BadRequestException('restaurantId is required');
    }

    const tenantId =
      query.tenantId ??
      (await this.branchesRepository.findTenantIdByRestaurant(
        query.restaurantId,
      ));

    if (!tenantId) {
      throw new BadRequestException(
        'tenantId could not be resolved for restaurant',
      );
    }

    const { items, total } = await this.branchesRepository.listByRestaurant(
      tenantId,
      query.restaurantId,
      query,
      true,
    );

    return {
      data: await Promise.all(
        (await this.attachBranchAddresses(items, null)).map((item) =>
          this.withBranchDeletionState(
            this.withVisibleBranchSettings(null, item),
          ),
        ),
      ),
      message: 'Public branches fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const branch = await this.branchesRepository.findById(id);

    if (!branch || branch.deletedAt) {
      if (
        user.role === UserRoleEnum.BRANCH_ADMIN &&
        user.bid &&
        user.bid === id
      ) {
        throw new BadRequestException({
          message:
            'Assigned branch is soft-deleted. Restore branch to continue.',
          error: 'ASSIGNED_BRANCH_SOFT_DELETED',
          details: {
            branchId: id,
            isDeleted: true,
            deletionScheduled: false,
            deletedAt: branch?.deletedAt?.toISOString?.() ?? null,
            canRestore: true,
          },
        });
      }

      throw new BadRequestException('Branch not found');
    }

    await this.assertBranchAccess(user, branch);

    const [address] = await this.branchesRepository.listBranchAddresses([id]);

    return {
      data: await this.withBranchDeletionState({
        ...this.withVisibleBranchSettings(user, branch),
        branchAdmin: branch.manager
          ? {
              id: branch.manager.id,
              email: branch.manager.email,
              firstName: branch.manager.profile?.firstName ?? '',
              lastName: branch.manager.profile?.lastName ?? '',
              phone: branch.manager.profile?.phone ?? '',
            }
          : null,
        address: address
          ? {
              street: address.street,
              shopNumber: address.area,
              postalCode: address.postalCode,
              city: address.city,
              area: address.area,
              state: address.state,
              country: address.country,
              lat: address.lat,
              lng: address.lng,
            }
          : null,
      }),
      message: 'Branch fetched successfully',
    };
  }

  async getOpeningHours(user: AuthUserContext, id: string) {
    const branch = await this.branchesRepository.findById(id);

    if (!branch || branch.deletedAt) {
      throw new BadRequestException('Branch not found');
    }

    await this.assertBranchAccess(user, branch);

    return {
      data: this.readOpeningHours(branch.settings),
      message: 'Branch opening hours fetched successfully',
    };
  }

  async getHolidayOpeningHours(user: AuthUserContext, id: string) {
    const branch = await this.branchesRepository.findById(id);

    if (!branch || branch.deletedAt) {
      throw new BadRequestException('Branch not found');
    }

    await this.assertBranchAccess(user, branch);

    return {
      data: this.readHolidayOpeningHours(branch.settings),
      message: 'Branch holiday opening hours fetched successfully',
    };
  }

  async updateHolidayOpeningHours(
    user: AuthUserContext,
    id: string,
    dto: UpdateBranchHolidayOpeningHoursDto,
    tx?: PrismaTx,
  ) {
    const branch = await this.branchesRepository.findById(id);

    if (!branch || branch.deletedAt) {
      throw new BadRequestException('Branch not found');
    }

    await this.assertBranchWriteAccess(user, branch);

    const settings = this.readSettings(branch.settings);
    const holidayOpeningHours = this.normalizeHolidayOpeningHours(
      dto.holidayOpeningHours,
    );

    const data = await this.branchesRepository.update(
      id,
      {
        settings: {
          ...settings,
          holidayOpeningHours,
        } as unknown as Prisma.InputJsonValue,
      },
      tx,
    );

    return {
      data: {
        branchId: data.id,
        holidayOpeningHours,
        availability: this.resolveBranchAvailability({
          ...data,
          settings: { ...settings, holidayOpeningHours },
        }),
      },
      message: 'Branch holiday opening hours updated successfully',
    };
  }

  async getDeliveryTime(user: AuthUserContext, id: string) {
    const branch = await this.branchesRepository.findById(id);

    if (!branch || branch.deletedAt) {
      throw new BadRequestException('Branch not found');
    }

    await this.assertBranchAccess(user, branch);

    return {
      data: {
        branchId: branch.id,
        deliveryTime: this.readDeliveryTime(branch.settings),
        deliveryIntervalMinutes: this.readTimeInterval(
          branch.settings,
          'deliveryIntervalMinutes',
        ),
        pickupIntervalMinutes: this.readTimeInterval(
          branch.settings,
          'pickupIntervalMinutes',
        ),
      },
      message: 'Branch delivery time fetched successfully',
    };
  }

  async updateDeliveryTime(
    user: AuthUserContext,
    id: string,
    dto: UpdateBranchDeliveryTimeDto,
    tx?: PrismaTx,
  ) {
    const branch = await this.branchesRepository.findById(id);

    if (!branch || branch.deletedAt) {
      throw new BadRequestException('Branch not found');
    }

    await this.assertBranchWriteAccess(user, branch);

    const settings = this.readSettings(branch.settings);
    const data = await this.branchesRepository.update(
      id,
      {
        settings: {
          ...settings,
          ...(dto.deliveryTime !== undefined
            ? { deliveryTime: dto.deliveryTime }
            : {}),
          ...(dto.deliveryIntervalMinutes !== undefined
            ? { deliveryIntervalMinutes: dto.deliveryIntervalMinutes }
            : {}),
          ...(dto.pickupIntervalMinutes !== undefined
            ? { pickupIntervalMinutes: dto.pickupIntervalMinutes }
            : {}),
        } as unknown as Prisma.InputJsonValue,
      },
      tx,
    );

    return {
      data: {
        branchId: data.id,
        deliveryTime:
          dto.deliveryTime !== undefined
            ? dto.deliveryTime
            : this.readDeliveryTime(settings),
        deliveryIntervalMinutes:
          dto.deliveryIntervalMinutes !== undefined
            ? dto.deliveryIntervalMinutes
            : this.readTimeInterval(settings, 'deliveryIntervalMinutes'),
        pickupIntervalMinutes:
          dto.pickupIntervalMinutes !== undefined
            ? dto.pickupIntervalMinutes
            : this.readTimeInterval(settings, 'pickupIntervalMinutes'),
      },
      message: 'Branch delivery time updated successfully',
    };
  }

  async getDeliveryHours(user: AuthUserContext, id: string) {
    const branch = await this.branchesRepository.findById(id);

    if (!branch || branch.deletedAt) {
      throw new BadRequestException('Branch not found');
    }

    await this.assertBranchAccess(user, branch);

    return {
      data: {
        branchId: branch.id,
        deliveryHours: this.readDeliveryHours(branch.settings),
      },
      message: 'Branch delivery hours fetched successfully',
    };
  }

  async updateDeliveryHours(
    user: AuthUserContext,
    id: string,
    dto: UpdateBranchDeliveryHoursDto,
    tx?: PrismaTx,
  ) {
    const branch = await this.branchesRepository.findById(id);

    if (!branch || branch.deletedAt) {
      throw new BadRequestException('Branch not found');
    }

    await this.assertBranchWriteAccess(user, branch);

    const settings = this.readSettings(branch.settings);
    const deliveryHours = this.normalizeOpeningHours(
      dto.deliveryHours,
      'delivery-hours',
    );
    const data = await this.branchesRepository.update(
      id,
      {
        settings: {
          ...settings,
          deliveryHours,
        } as unknown as Prisma.InputJsonValue,
      },
      tx,
    );

    return {
      data: {
        branchId: data.id,
        deliveryHours,
      },
      message: 'Branch delivery hours updated successfully',
    };
  }

  async updateOpeningHours(
    user: AuthUserContext,
    id: string,
    dto: UpdateBranchOpeningHoursDto,
    tx?: PrismaTx,
  ) {
    const branch = await this.branchesRepository.findById(id);

    if (!branch || branch.deletedAt) {
      throw new BadRequestException('Branch not found');
    }

    await this.assertBranchWriteAccess(user, branch);

    const openingHours =
      dto.openingHours === undefined
        ? this.readOpeningHours(branch.settings)
        : this.normalizeOpeningHours(dto.openingHours);
    const settings = this.readSettings(branch.settings);
    const incomingSettings = this.sanitizeBranchSettingsInput(
      user,
      dto.settings,
    );

    const data = await this.branchesRepository.update(
      id,
      {
        settings: {
          ...settings,
          ...(incomingSettings ?? {}),
          openingHours,
        } as unknown as Prisma.InputJsonValue,
      },
      tx,
    );

    return {
      data: {
        branchId: data.id,
        openingHours,
      },
      message: 'Branch opening hours updated successfully',
    };
  }

  async updateTemporaryClosure(
    user: AuthUserContext,
    id: string,
    dto: UpdateBranchTemporaryClosureDto,
    tx?: PrismaTx,
  ) {
    const branch = await this.branchesRepository.findById(id);

    if (!branch || branch.deletedAt) {
      throw new BadRequestException('Branch not found');
    }

    await this.assertBranchWriteAccess(user, branch);

    const settings = this.readSettings(branch.settings);
    const temporaryClosure = this.normalizeTemporaryClosure(dto);

    const data = await this.branchesRepository.update(
      id,
      {
        settings: {
          ...settings,
          temporaryClosure,
        } as unknown as Prisma.InputJsonValue,
      },
      tx,
    );

    return {
      data: {
        branchId: data.id,
        temporaryClosure,
        availability: this.resolveBranchAvailability({
          ...data,
          settings: {
            ...settings,
            temporaryClosure,
          },
        }),
      },
      message: temporaryClosure.isClosed
        ? 'Branch temporarily closed successfully'
        : 'Branch reopened successfully',
    };
  }

  async update(
    user: AuthUserContext,
    id: string,
    dto: UpdateBranchDto,
    tx?: PrismaTx,
  ) {
    const branch = await this.branchesRepository.findById(id);

    if (!branch || branch.deletedAt) {
      throw new BadRequestException('Branch not found');
    }

    await this.assertBranchWriteAccess(user, branch);
    const updateDto = this.resolveBranchUpdateDto(user, dto);
    const sanitizedSettings = this.sanitizeBranchSettingsInput(
      user,
      updateDto.settings,
    );
    this.assertValidDeliveryConfiguration(sanitizedSettings);
    await this.assertRestaurantPaymentMethods(
      branch.restaurantId,
      this.readSettings(sanitizedSettings).allowedPaymentMethods,
      tx,
    );
    const mergedSettings =
      sanitizedSettings === undefined
        ? undefined
        : ({
            ...this.readSettings(branch.settings),
            ...sanitizedSettings,
          } as unknown as Prisma.InputJsonValue);

    const operation = async (trx: PrismaTx) => {
      const data = await this.branchesRepository.update(
        id,
        {
          name: updateDto.name,
          isMain: updateDto.isMain,
          logoUrl:
            updateDto.logoUrl !== undefined
              ? this.normalizeMediaUrl(updateDto.logoUrl)
              : undefined,
          coverImage:
            updateDto.coverImage !== undefined
              ? this.normalizeMediaUrl(updateDto.coverImage)
              : undefined,
          description: updateDto.description,
          settings: mergedSettings,
        },
        trx,
      );

      if (this.hasBranchAddressPayload(updateDto)) {
        const updatedAddress =
          await this.branchesRepository.updateBranchAddress(
            id,
            this.toBranchAddressUpdateInput(updateDto),
            trx,
          );

        if (!updatedAddress) {
          this.assertCompleteBranchAddress(updateDto);

          await this.branchesRepository.createBranchAddress(
            {
              tenantId: branch.tenantId,
              branchId: id,
              street: updateDto.street,
              area: this.resolveShopNumber(updateDto),
              postalCode: updateDto.postalCode,
              city: updateDto.city,
              state: updateDto.state,
              country: updateDto.country,
              lat: updateDto.lat,
              lng: updateDto.lng,
            },
            trx,
          );
        }
      }

      await this.updateBranchAdminIfRequested(branch, updateDto, trx);

      return data;
    };

    const data = tx
      ? await operation(tx)
      : await this.branchesRepository.transaction(operation);

    return {
      data: await this.resolveBranchMedia(
        this.withVisibleBranchSettings(user, data),
      ),
      message: 'Branch updated successfully',
    };
  }

  async updateNotificationSettings(
    user: AuthUserContext,
    id: string,
    dto: UpdateBranchNotificationSettingsDto,
  ) {
    const branch = await this.branchesRepository.findById(id);

    if (!branch || branch.deletedAt) {
      throw new BadRequestException('Branch not found');
    }

    await this.assertBranchWriteAccess(user, branch);

    const emailAddress = dto.emailAddress?.trim().toLowerCase();
    if (dto.enabled && !emailAddress) {
      throw new BadRequestException(
        'Order notification email is required when notifications are enabled',
      );
    }

    const settings = this.readSettings(branch.settings);
    const notificationSettings = this.readSettings(
      settings.notificationSettings,
    );
    const notificationTypes = this.readSettings(
      notificationSettings.notificationTypes,
    );
    const newOrder = this.readSettings(notificationTypes.newOrder);
    const nextSettings = {
      ...settings,
      notificationSettings: {
        ...notificationSettings,
        ...(emailAddress !== undefined ? { emailAddress } : {}),
        notificationTypes: {
          ...notificationTypes,
          newOrder: {
            ...newOrder,
            email: dto.enabled,
          },
        },
      },
    };

    const data = await this.branchesRepository.update(id, {
      settings: nextSettings as unknown as Prisma.InputJsonValue,
    });

    return {
      data: this.withVisibleBranchSettings(user, data),
      message: 'Branch notification settings updated successfully',
    };
  }

  async suspend(_user: AuthUserContext, id: string, tx?: PrismaTx) {
    const data = await this.branchesRepository.setActive(id, false, tx);

    return {
      data: await this.resolveBranchMedia(data),
      message: 'Branch suspended successfully',
    };
  }

  async activate(_user: AuthUserContext, id: string, tx?: PrismaTx) {
    const data = await this.branchesRepository.setActive(id, true, tx);

    return {
      data: await this.resolveBranchMedia(data),
      message: 'Branch activated successfully',
    };
  }

  async restore(user: AuthUserContext, id: string, tx?: PrismaTx) {
    if (
      user.role !== UserRoleEnum.SUPER_ADMIN &&
      user.role !== UserRoleEnum.BUSINESS_ADMIN
    ) {
      throw new ForbiddenException(
        'Only business admin or super admin can restore branches',
      );
    }

    const branch = await this.branchesRepository.findBranchTenant(id);

    if (!branch) {
      throw new BadRequestException('Branch not found');
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (branch.tenantId !== user.tid) {
        throw new ForbiddenException(
          'You cannot restore branches outside your tenant restaurants',
        );
      }
    }

    const data = await this.branchesRepository.restore(id, tx);

    return {
      data: await this.resolveBranchMedia(data),
      message: 'Branch restored successfully',
    };
  }

  async updateImages(
    user: AuthUserContext,
    id: string,
    dto: UpdateBranchImagesDto,
    tx?: PrismaTx,
  ) {
    const branch = await this.branchesRepository.findById(id);

    if (!branch || branch.deletedAt) {
      throw new BadRequestException('Branch not found');
    }

    await this.assertBranchWriteAccess(user, branch);

    const data = await this.branchesRepository.update(
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
      data: await this.resolveBranchMedia(data),
      message: 'Branch images updated successfully',
    };
  }

  async remove(_user: AuthUserContext, id: string, tx?: PrismaTx) {
    const data = await this.branchesRepository.softDelete(id, tx);

    return {
      data,
      message: 'Branch soft deleted successfully',
    };
  }

  async cleanupOrphanedBranchResources(
    user: AuthUserContext,
    id: string,
    dto: CleanupOrphanBranchDto,
  ) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only super admin can clean orphan branch resources',
      );
    }

    const summary = await this.branchesRepository.getOrphanCleanupSummary(id);

    if (summary.branchExists) {
      throw new BadRequestException(
        'Branch still exists. Use guarded branch delete flows instead of orphan cleanup.',
      );
    }

    if (!dto.execute) {
      return {
        data: {
          branchId: id,
          mode: 'PREVIEW',
          ...summary,
        },
        message: 'Orphan branch cleanup preview generated successfully',
      };
    }

    const cleaned =
      await this.branchesRepository.cleanupOrphanedBranchResources(id);

    return {
      data: {
        branchId: id,
        mode: 'EXECUTE',
        cleaned,
        remainingWarnings: summary.warnings,
      },
      message: 'Safe orphan branch cleanup executed successfully',
    };
  }

  async forceDelete(user: AuthUserContext, id: string, tx?: PrismaTx) {
    if (
      user.role !== UserRoleEnum.SUPER_ADMIN &&
      user.role !== UserRoleEnum.BUSINESS_ADMIN
    ) {
      throw new ForbiddenException(
        'Only business admin or super admin can force delete branches',
      );
    }

    const branch = await this.branchesRepository.findBranchRestaurant(id);

    if (!branch) {
      throw new BadRequestException('Branch not found');
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      const restaurant = await this.branchesRepository.findRestaurantInTenant(
        branch.restaurantId,
        user.tid,
      );

      if (!restaurant) {
        throw new ForbiddenException(
          'You cannot access resources outside your tenant restaurants',
        );
      }
    }

    const summary = await this.branchesRepository.getDeleteSummary(id);
    const blockers = Object.entries(summary)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({ resource: key, count }));

    if (blockers.length > 0) {
      throw new BadRequestException({
        message:
          'Branch cannot be force deleted while related records still exist',
        blockers,
      });
    }

    const data = await this.branchesRepository.forceDelete(id, tx);

    return {
      data,
      message: 'Branch force deleted successfully',
    };
  }

  private async withBranchDeletionState<
    T extends {
      deletedAt?: Date | null;
      isActive?: boolean;
      logoUrl?: string | null;
      coverImage?: string | null;
      settings?: unknown;
    },
  >(branch: T) {
    return {
      ...(await this.resolveBranchMedia(branch)),
      availability: this.resolveBranchAvailability(branch),
      deletionState: {
        isDeleted: !!branch.deletedAt,
        deletionScheduled: false,
        deletedAt: branch.deletedAt ?? null,
        deleteAfter: null,
        isActive: branch.isActive ?? true,
      },
    };
  }

  private resolveBranchAvailability(branch: {
    isActive?: boolean;
    settings?: unknown;
  }) {
    const settings = this.readSettings(branch.settings);
    const temporaryClosure = this.resolveActiveTemporaryClosure(
      settings.temporaryClosure,
    );
    const holidayOpeningHour = this.resolveTodayHolidayOpeningHour(
      settings.holidayOpeningHours,
    );
    const isHolidayClosed = !!holidayOpeningHour?.isClosed;

    return {
      isActive: branch.isActive ?? true,
      isTemporarilyClosed: !!temporaryClosure,
      isHolidayClosed,
      isAvailable:
        (branch.isActive ?? true) && !temporaryClosure && !isHolidayClosed,
      temporaryClosure,
      holidayOpeningHour,
    };
  }

  private generateBranchAdminPassword(): string {
    return `Br@${randomBytes(4).toString('hex')}2026`;
  }

  private assertValidDeliveryConfiguration(settings?: unknown) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return;
    }

    const deliveryConfig = (settings as { deliveryConfig?: unknown })
      .deliveryConfig;

    if (
      !deliveryConfig ||
      typeof deliveryConfig !== 'object' ||
      Array.isArray(deliveryConfig)
    ) {
      return;
    }

    const config = deliveryConfig as {
      mode?: string;
      zoneBands?: Array<{ fromKm?: number; toKm?: number }>;
      postalCodeRules?: Array<{ postalCode?: string; deliveryFee?: number }>;
    };

    if (config.mode === 'POSTAL_CODE') {
      if (
        !Array.isArray(config.postalCodeRules) ||
        config.postalCodeRules.length === 0
      ) {
        throw new BadRequestException(
          'postalCodeRules are required when delivery mode is POSTAL_CODE',
        );
      }

      const seenPostalCodes = new Set<string>();
      config.postalCodeRules.forEach((rule, index) => {
        const postalCode = rule.postalCode?.trim().toUpperCase();
        if (!postalCode || typeof rule.deliveryFee !== 'number') {
          throw new BadRequestException(
            `postalCodeRules[${index}] must have postalCode and deliveryFee`,
          );
        }

        if (seenPostalCodes.has(postalCode)) {
          throw new BadRequestException(
            'postalCodeRules cannot have duplicates',
          );
        }

        seenPostalCodes.add(postalCode);
      });
    }

    if (config.mode === 'ZONE_BANDS') {
      if (!Array.isArray(config.zoneBands) || config.zoneBands.length === 0) {
        throw new BadRequestException(
          'zoneBands are required when delivery mode is ZONE_BANDS',
        );
      }

      const sortedBands = [...config.zoneBands].sort(
        (a, b) => (a.fromKm ?? 0) - (b.fromKm ?? 0),
      );

      sortedBands.forEach((band, index) => {
        if (
          typeof band.fromKm !== 'number' ||
          typeof band.toKm !== 'number' ||
          band.fromKm < 0 ||
          band.toKm <= band.fromKm
        ) {
          throw new BadRequestException(
            `zoneBands[${index}] must have valid fromKm/toKm bounds`,
          );
        }

        if (index === 0) {
          return;
        }

        const previousBand = sortedBands[index - 1];
        if ((band.fromKm ?? 0) < (previousBand.toKm ?? 0)) {
          throw new BadRequestException('zoneBands cannot overlap');
        }
      });
    }
  }

  private hasBranchAddressPayload(dto: UpdateBranchDto) {
    return [
      dto.street,
      dto.shopNumber,
      dto.area,
      dto.postalCode,
      dto.city,
      dto.state,
      dto.country,
      dto.lat,
      dto.lng,
    ].some((value) => value !== undefined);
  }

  private resolveShopNumber(dto: {
    shopNumber?: string;
    area?: string;
  }): string | undefined {
    return dto.shopNumber ?? dto.area;
  }

  private toBranchAddressUpdateInput(
    dto: UpdateBranchDto,
  ): Prisma.AddressUpdateInput {
    return {
      street: dto.street,
      area: this.resolveShopNumber(dto),
      postalCode: dto.postalCode,
      city: dto.city,
      state: dto.state,
      country: dto.country,
      lat: dto.lat !== undefined ? new Prisma.Decimal(dto.lat) : undefined,
      lng: dto.lng !== undefined ? new Prisma.Decimal(dto.lng) : undefined,
    };
  }

  private assertCompleteBranchAddress(
    dto: UpdateBranchDto,
  ): asserts dto is UpdateBranchDto & {
    street: string;
    city: string;
    state: string;
    country: string;
    lat: string;
    lng: string;
  } {
    if (
      !dto.street ||
      !dto.city ||
      !dto.state ||
      !dto.country ||
      !dto.lat ||
      !dto.lng
    ) {
      throw new BadRequestException(
        'street, city, state, country, lat and lng are required when creating a missing branch address',
      );
    }
  }

  private async assertBranchAccess(
    user: AuthUserContext,
    branch: {
      tenantId: string;
      restaurantId: string;
      id: string;
      isActive: boolean;
    },
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (branch.tenantId !== user.tid) {
        throw new ForbiddenException(
          'You cannot access resources outside your tenant restaurants',
        );
      }

      return;
    }

    if (this.isStaff(user)) {
      const staffAccess = await this.resolveStaffBranchAccess(user, 'read');
      this.resolveStaffRestaurantId(staffAccess, branch.restaurantId);

      if (
        staffAccess.branchIds.length > 0 &&
        !staffAccess.branchIds.includes(branch.id)
      ) {
        throw new ForbiddenException(
          'Staff account is not assigned to this branch',
        );
      }

      return;
    }

    if (user.rid !== branch.restaurantId) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }

    if (
      user.role === UserRoleEnum.BRANCH_ADMIN &&
      user.bid &&
      user.bid !== branch.id
    ) {
      throw new ForbiddenException(
        'You cannot access resources outside your branch',
      );
    }

    if (user.role === UserRoleEnum.CUSTOMER && !branch.isActive) {
      throw new ForbiddenException('Branch is not available');
    }
  }

  private async assertBranchWriteAccess(
    user: AuthUserContext,
    branch: { tenantId: string; restaurantId: string; id: string },
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (branch.tenantId !== user.tid) {
        throw new ForbiddenException(
          'You cannot access resources outside your tenant restaurants',
        );
      }

      return;
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      const scopedBranchId = this.resolveTokenBranchScope(user);

      if (!scopedBranchId) {
        throw new ForbiddenException('Branch context is required');
      }

      if (user.rid !== branch.restaurantId) {
        throw new ForbiddenException(
          'You cannot access resources outside your restaurant',
        );
      }

      if (scopedBranchId !== branch.id) {
        throw new ForbiddenException(
          'You cannot access resources outside your branch',
        );
      }

      return;
    }

    if (this.isStaff(user)) {
      const staffAccess = await this.resolveStaffBranchAccess(user, 'update');
      this.resolveStaffRestaurantId(staffAccess, branch.restaurantId);

      if (
        staffAccess.branchIds.length > 0 &&
        !staffAccess.branchIds.includes(branch.id)
      ) {
        throw new ForbiddenException(
          'Staff account is not assigned to this branch',
        );
      }

      return;
    }

    throw new ForbiddenException(
      'Insufficient permissions for branch opening hours write',
    );
  }

  private resolveBranchUpdateDto(
    user: AuthUserContext,
    dto: UpdateBranchDto,
  ): UpdateBranchDto {
    if (user.role !== UserRoleEnum.BRANCH_ADMIN) {
      return dto;
    }

    return {
      ...dto,
      branchAdmin: undefined,
    };
  }

  private resolveTokenBranchScope(user: AuthUserContext): string | undefined {
    return user.bid ?? user.branchId;
  }

  private async updateBranchAdminIfRequested(
    branch: BranchAdminUpdateTarget,
    dto: UpdateBranchDto,
    tx: PrismaTx,
  ) {
    if (!this.hasBranchAdminUpdatePayload(dto)) {
      return;
    }

    const branchAdmin = dto.branchAdmin;
    if (!branchAdmin) {
      return;
    }

    const managerId = branch.manager?.id ?? branch.managerId;
    if (!managerId) {
      return;
    }

    const email = branchAdmin.email?.trim().toLowerCase();

    if (email && email !== branch.manager?.email) {
      const existingBranchAdmin = await this.usersService.findByEmail(
        email,
        branch.restaurantId,
      );

      if (existingBranchAdmin && existingBranchAdmin.id !== managerId) {
        throw new BadRequestException(
          'Branch admin already exists for this restaurant',
        );
      }
    }

    await this.usersService.update(
      managerId,
      {
        email: email || undefined,
        password: branchAdmin.password
          ? await bcrypt.hash(branchAdmin.password, 10)
          : undefined,
        profile: this.hasBranchAdminProfileUpdatePayload(dto)
          ? {
              firstName:
                branchAdmin.firstName ??
                branch.manager?.profile?.firstName ??
                '',
              lastName:
                branchAdmin.lastName ?? branch.manager?.profile?.lastName ?? '',
              phone: branchAdmin.phone ?? branch.manager?.profile?.phone ?? '',
            }
          : undefined,
      },
      tx,
    );
  }

  private hasBranchAdminUpdatePayload(dto: UpdateBranchDto) {
    const branchAdmin = dto.branchAdmin;

    return Boolean(
      branchAdmin &&
      (branchAdmin.email !== undefined ||
        branchAdmin.password !== undefined ||
        branchAdmin.firstName !== undefined ||
        branchAdmin.lastName !== undefined ||
        branchAdmin.phone !== undefined),
    );
  }

  private hasBranchAdminProfileUpdatePayload(dto: UpdateBranchDto) {
    const branchAdmin = dto.branchAdmin;

    return Boolean(
      branchAdmin &&
      (branchAdmin.firstName !== undefined ||
        branchAdmin.lastName !== undefined ||
        branchAdmin.phone !== undefined),
    );
  }

  private resolveScopedRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): string {
    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (requestedRestaurantId) {
        return requestedRestaurantId;
      }

      if (user.rid) {
        return user.rid;
      }

      throw new BadRequestException('restaurantId is required');
    }

    if (
      user.role === UserRoleEnum.BRANCH_ADMIN ||
      user.role === UserRoleEnum.CUSTOMER
    ) {
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

    if (!requestedRestaurantId) {
      throw new BadRequestException('restaurantId is required');
    }

    return requestedRestaurantId;
  }

  private resolveNearestOrigin(query: ListBranchesDto): DistanceOrigin | null {
    if (query.lat === undefined && query.lng === undefined) {
      return null;
    }

    if (query.lat === undefined || query.lng === undefined) {
      throw new BadRequestException(
        'lat and lng are required together when fetching nearest branches',
      );
    }

    return {
      lat: query.lat,
      lng: query.lng,
    };
  }

  private async attachDistanceAndPaginate(
    items: Branch[],
    query: { page: number; limit: number },
    origin: DistanceOrigin | null,
  ) {
    const enriched = await this.attachBranchAddresses(items, origin);

    if (origin) {
      enriched.sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) {
          return 0;
        }
        if (a.distanceKm === null) {
          return 1;
        }
        if (b.distanceKm === null) {
          return -1;
        }
        return a.distanceKm - b.distanceKm;
      });
    }

    const start = (query.page - 1) * query.limit;
    return {
      items: enriched.slice(start, start + query.limit),
      total: enriched.length,
    };
  }

  private async attachBranchAddresses(
    items: Branch[],
    origin: DistanceOrigin | null,
  ) {
    if (!items.length) {
      return [];
    }

    const addresses = await this.branchesRepository.listBranchAddresses(
      items.map((item) => item.id),
    );
    const addressMap = new Map<string, BranchDistanceAddress>(
      addresses.map((address) => [address.referenceId, address]),
    );

    return items.map((item) => {
      const address = addressMap.get(item.id);
      const distanceKm =
        origin && address?.lat && address?.lng
          ? this.calculateDistanceKm(
              origin.lat,
              origin.lng,
              Number(address.lat),
              Number(address.lng),
            )
          : null;

      return {
        ...item,
        address: address
          ? {
              street: address.street,
              shopNumber: address.area,
              postalCode: address.postalCode,
              city: address.city,
              area: address.area,
              state: address.state,
              country: address.country,
              lat: address.lat,
              lng: address.lng,
            }
          : null,
        distanceKm,
      };
    });
  }

  private async resolveMediaUrl(value: string | null | undefined) {
    return this.storageService.resolveViewUrl(this.normalizeMediaUrl(value));
  }

  private async resolveBranchMedia<
    T extends {
      logoUrl?: string | null;
      coverImage?: string | null;
    },
  >(branch: T) {
    return {
      ...branch,
      logoUrl: await this.resolveMediaUrl(branch.logoUrl ?? null),
      coverImage: await this.resolveMediaUrl(branch.coverImage ?? null),
    };
  }

  private normalizeMediaUrl(value: string | null | undefined) {
    if (value === undefined || value === null) {
      return value;
    }

    const trimmed = value.trim();

    if (
      !trimmed ||
      trimmed === 'undefined' ||
      trimmed === 'null' ||
      trimmed === '[object Object]'
    ) {
      return null;
    }

    return trimmed;
  }

  private readSettings(value: unknown): BranchSettingsLike {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as BranchSettingsLike;
  }

  private withVisibleBranchSettings<
    T extends {
      settings?: unknown;
    },
  >(user: AuthUserContext | null, branch: T): T {
    if (user?.role === UserRoleEnum.SUPER_ADMIN) {
      return branch;
    }

    return {
      ...branch,
      settings: this.omitServiceCharge(branch.settings),
    };
  }

  private sanitizeBranchSettingsInput(
    user: AuthUserContext,
    settings: unknown,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return settings;
    }

    return this.omitServiceCharge(settings);
  }

  private async assertRestaurantPaymentMethods(
    restaurantId: string,
    branchMethods: unknown,
    tx?: PrismaTx,
  ) {
    if (!Array.isArray(branchMethods)) {
      return;
    }

    const restaurant =
      await this.branchesRepository.findRestaurantPaymentSettings(
        restaurantId,
        tx,
      );
    if (!restaurant) {
      throw new BadRequestException('Restaurant not found');
    }

    const allowedMethods = resolveAvailablePaymentMethods({
      platformMethods: Object.values(PaymentMethod),
      restaurantSettings: restaurant.settings,
      branchSettings: {},
    });
    const invalidMethods = branchMethods.filter(
      (method): method is string =>
        typeof method === 'string' &&
        !allowedMethods.includes(method as PaymentMethod),
    );

    if (invalidMethods.length > 0) {
      throw new BadRequestException(
        `Payment methods are not assigned to this restaurant: ${[
          ...new Set(invalidMethods),
        ].join(', ')}`,
      );
    }
  }

  private omitServiceCharge<T>(settings: T): T {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return settings;
    }

    const visibleSettings = { ...(settings as Record<string, unknown>) };
    delete visibleSettings.serviceCharge;
    return visibleSettings as T;
  }

  private readOpeningHours(value: unknown): BranchOpeningHourItemDto[] {
    const settings = this.readSettings(value);
    const openingHours = settings.openingHours;

    if (!Array.isArray(openingHours)) {
      return [];
    }

    return this.normalizeOpeningHours(openingHours);
  }

  private readHolidayOpeningHours(
    value: unknown,
  ): NormalizedBranchHolidayOpeningHour[] {
    const settings = this.readSettings(value);
    const holidayOpeningHours = settings.holidayOpeningHours;

    if (!Array.isArray(holidayOpeningHours)) {
      return [];
    }

    return this.normalizeHolidayOpeningHours(holidayOpeningHours);
  }

  private readDeliveryTime(value: unknown): number | null {
    const settings = this.readSettings(value);
    return typeof settings.deliveryTime === 'number'
      ? settings.deliveryTime
      : null;
  }

  private readTimeInterval(
    value: unknown,
    key: 'deliveryIntervalMinutes' | 'pickupIntervalMinutes',
  ): number | null {
    const settings = this.readSettings(value);
    const interval = settings[key];

    return typeof interval === 'number' && Number.isFinite(interval)
      ? interval
      : null;
  }

  private readDeliveryHours(value: unknown): BranchOpeningHourItemDto[] {
    const settings = this.readSettings(value);
    const deliveryHours = settings.deliveryHours;

    if (!Array.isArray(deliveryHours) || !deliveryHours.length) {
      return this.readOpeningHours(value);
    }

    return this.normalizeOpeningHours(deliveryHours, 'delivery-hours');
  }

  private normalizeTemporaryClosure(
    dto: UpdateBranchTemporaryClosureDto,
  ): BranchTemporaryClosure {
    if (dto.isClosed === false) {
      return { isClosed: false };
    }

    const closedUntil = dto.closedUntil?.trim() || undefined;
    const reason = dto.reason?.trim() || undefined;
    const message = dto.message?.trim() || undefined;

    if (closedUntil && new Date(closedUntil).getTime() <= Date.now()) {
      throw new BadRequestException('closedUntil must be in the future');
    }

    return {
      isClosed: true,
      closedAt: new Date().toISOString(),
      closedUntil: closedUntil ?? null,
      reason: reason ?? null,
      message: message ?? null,
    };
  }

  private resolveActiveTemporaryClosure(
    closure: BranchTemporaryClosure | undefined,
  ): BranchTemporaryClosure | null {
    if (!closure?.isClosed) {
      return null;
    }

    if (
      closure.closedUntil &&
      new Date(closure.closedUntil).getTime() <= Date.now()
    ) {
      return null;
    }

    return closure;
  }

  private normalizeOpeningHours(
    openingHours: BranchOpeningHourItemDto[],
    label = 'opening-hours',
  ): BranchOpeningHourItemDto[] {
    const seenDays = new Set<BranchScheduleDayEnum>();
    const normalized = openingHours.map((item) => {
      if (seenDays.has(item.dayOfWeek)) {
        throw new BadRequestException(
          `Duplicate ${label} entry for ${item.dayOfWeek}`,
        );
      }
      seenDays.add(item.dayOfWeek);

      const note =
        item.note === undefined || item.note === null
          ? undefined
          : item.note.trim() || undefined;

      if (item.isClosed) {
        return {
          dayOfWeek: item.dayOfWeek,
          isClosed: true,
          openTime: null,
          closeTime: null,
          ...(note ? { note } : {}),
        };
      }

      if (!item.openTime || !item.closeTime) {
        throw new BadRequestException(
          `openTime and closeTime are required for ${item.dayOfWeek}`,
        );
      }

      if (item.openTime >= item.closeTime) {
        throw new BadRequestException(
          `closeTime must be later than openTime for ${item.dayOfWeek}`,
        );
      }

      const breakTimes = this.normalizeOpeningHourBreakTimes(
        item.breakTimes ?? [],
        item.openTime,
        item.closeTime,
        item.dayOfWeek,
      );

      return {
        dayOfWeek: item.dayOfWeek,
        isClosed: false,
        openTime: item.openTime,
        closeTime: item.closeTime,
        ...(breakTimes.length ? { breakTimes } : {}),
        ...(note ? { note } : {}),
      };
    });

    return normalized.sort(
      (a, b) =>
        BRANCH_OPENING_DAY_ORDER.indexOf(a.dayOfWeek) -
        BRANCH_OPENING_DAY_ORDER.indexOf(b.dayOfWeek),
    );
  }

  private normalizeOpeningHourBreakTimes(
    breakTimes: BranchOpeningHourBreakDto[],
    openTime: string,
    closeTime: string,
    dayOfWeek: BranchScheduleDayEnum,
  ): BranchOpeningHourBreakDto[] {
    const normalized = breakTimes.map((breakTime) => {
      if (breakTime.startTime >= breakTime.endTime) {
        throw new BadRequestException(
          `break endTime must be later than startTime for ${dayOfWeek}`,
        );
      }

      if (breakTime.startTime < openTime || breakTime.endTime > closeTime) {
        throw new BadRequestException(
          `breakTimes must be inside openTime and closeTime for ${dayOfWeek}`,
        );
      }

      const note =
        breakTime.note === undefined || breakTime.note === null
          ? undefined
          : breakTime.note.trim() || undefined;

      return {
        startTime: breakTime.startTime,
        endTime: breakTime.endTime,
        ...(note ? { note } : {}),
      };
    });

    const sorted = normalized.sort((a, b) =>
      a.startTime.localeCompare(b.startTime),
    );

    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index - 1].endTime > sorted[index].startTime) {
        throw new BadRequestException(
          `breakTimes cannot overlap for ${dayOfWeek}`,
        );
      }
    }

    return sorted;
  }

  private normalizeHolidayOpeningHours(
    holidayOpeningHours: BranchHolidayOpeningHourItemDto[],
  ): NormalizedBranchHolidayOpeningHour[] {
    const seenPeriods = new Set<string>();
    const normalized = holidayOpeningHours.map((item) => {
      const date = item.date?.trim() || undefined;
      const fromDate = item.fromDate?.trim() || undefined;
      const toDate = item.toDate?.trim() || undefined;

      if (!date && (!fromDate || !toDate)) {
        throw new BadRequestException(
          'date or fromDate/toDate is required for holiday opening hours',
        );
      }

      if (date && (fromDate || toDate)) {
        throw new BadRequestException(
          'Use either date or fromDate/toDate for holiday opening hours',
        );
      }

      const normalizedFromDate = date ?? fromDate;
      const normalizedToDate = date ?? toDate;

      if (!normalizedFromDate || !normalizedToDate) {
        throw new BadRequestException(
          'fromDate and toDate are both required for holiday ranges',
        );
      }

      this.assertValidDateOnly(normalizedFromDate, 'fromDate');
      this.assertValidDateOnly(normalizedToDate, 'toDate');

      if (normalizedFromDate > normalizedToDate) {
        throw new BadRequestException('toDate must be same or after fromDate');
      }

      const periodKey = date ?? `${normalizedFromDate}:${normalizedToDate}`;
      if (seenPeriods.has(periodKey)) {
        throw new BadRequestException(
          `Duplicate holiday opening-hours entry for ${periodKey}`,
        );
      }
      seenPeriods.add(periodKey);

      const note =
        item.note === undefined || item.note === null
          ? undefined
          : item.note.trim() || undefined;
      const period = date
        ? { date }
        : { fromDate: normalizedFromDate, toDate: normalizedToDate };

      if (item.isClosed) {
        return {
          ...period,
          isClosed: true,
          openTime: null,
          closeTime: null,
          ...(note ? { note } : {}),
        };
      }

      if (!item.openTime || !item.closeTime) {
        throw new BadRequestException(
          `openTime and closeTime are required for ${periodKey}`,
        );
      }

      if (item.openTime >= item.closeTime) {
        throw new BadRequestException(
          `closeTime must be later than openTime for ${periodKey}`,
        );
      }

      return {
        ...period,
        isClosed: false,
        openTime: item.openTime,
        closeTime: item.closeTime,
        ...(note ? { note } : {}),
      };
    });

    return normalized.sort((a, b) => {
      const aDate = a.date ?? a.fromDate ?? '';
      const bDate = b.date ?? b.fromDate ?? '';
      return aDate.localeCompare(bDate);
    });
  }

  private resolveTodayHolidayOpeningHour(
    holidayOpeningHours: NormalizedBranchHolidayOpeningHour[] | undefined,
  ): NormalizedBranchHolidayOpeningHour | null {
    if (!Array.isArray(holidayOpeningHours)) {
      return null;
    }

    const today = new Date().toISOString().slice(0, 10);
    return (
      holidayOpeningHours.find((item) =>
        this.isDateInHolidayPeriod(item, today),
      ) ?? null
    );
  }

  private isDateInHolidayPeriod(
    item: NormalizedBranchHolidayOpeningHour,
    date: string,
  ) {
    if (item.date) {
      return item.date === date;
    }

    return (
      !!item.fromDate &&
      !!item.toDate &&
      item.fromDate <= date &&
      item.toDate >= date
    );
  }

  private assertValidDateOnly(value: string, fieldName: string) {
    const parsedDate = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(
        `${fieldName} must be a valid calendar date`,
      );
    }
  }

  private calculateDistanceKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((earthRadiusKm * c).toFixed(2));
  }
}
