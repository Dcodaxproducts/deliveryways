import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Branch, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { PrismaTx } from '../../common/types';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaService } from '../../database';
import { UsersService } from '../users/users.service';
import { BranchesRepository } from './branches.repository';
import {
  BranchOpeningHourItemDto,
  BranchScheduleDayEnum,
  BulkCreateBranchesDto,
  CreateBranchDto,
  ListBranchesDto,
  ListPublicBranchesDto,
  UpdateBranchDto,
  UpdateBranchImagesDto,
  UpdateBranchOpeningHoursDto,
} from './dto';

interface BranchDistanceAddress {
  referenceId: string;
  lat: Prisma.Decimal | null;
  lng: Prisma.Decimal | null;
  street: string;
  area: string | null;
  city: string;
  state: string;
  country: string;
}

interface DistanceOrigin {
  lat: number;
  lng: number;
}

interface BranchSettingsLike {
  openingHours?: BranchOpeningHourItemDto[];
  [key: string]: unknown;
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
    private readonly prisma: PrismaService,
  ) {}

  async create(tenantId: string, dto: CreateBranchDto, tx?: PrismaTx) {
    if (!dto.restaurantId) {
      throw new BadRequestException('restaurantId is required');
    }

    return this.branchesRepository.create(
      {
        tenantId,
        restaurantId: dto.restaurantId,
        name: dto.name,
        isMain: dto.isMain,
        street: dto.street,
        area: dto.area,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        lat: dto.lat,
        lng: dto.lng,
        coverImage: dto.coverImage,
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
    };

    if (!dto.branchAdmin) {
      const data = await this.create(user.tid, branchDto, tx);
      return {
        data,
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
          restaurantId: dto.restaurantId,
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
      : await this.prisma.$transaction(async (trx) => operation(trx));

    return {
      data: {
        ...result,
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

    const createdBranches = await this.prisma.$transaction(async (trx) => {
      const results: Branch[] = [];

      for (const item of dto.branches) {
        const branchInput: CreateBranchDto = {
          ...item,
          restaurantId: effectiveRestaurantId,
        };

        const branch = await this.create(user.tid as string, branchInput, trx);
        results.push(branch);
      }

      return results;
    });

    return {
      data: createdBranches,
      message: 'Branches created successfully',
      meta: {
        totalCreated: createdBranches.length,
      },
    };
  }

  async list(user: AuthUserContext, query: ListBranchesDto) {
    const nearestOrigin = this.resolveNearestOrigin(query);

    if (user.role === UserRoleEnum.BRANCH_ADMIN && user.bid) {
      const items = await this.branchesRepository.listByBranchId(user.bid);
      const data = await this.attachDistanceAndPaginate(
        items,
        { page: query.page, limit: query.limit },
        nearestOrigin,
      );

      return {
        data: data.items,
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
        data: data.items,
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
      data: await this.attachBranchAddresses(items, null),
      message: 'Branches fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
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
      data: await this.attachBranchAddresses(items, null),
      message: 'Public branches fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const branch = await this.branchesRepository.findById(id);

    if (!branch || branch.deletedAt) {
      throw new BadRequestException('Branch not found');
    }

    this.assertBranchAccess(user, branch);

    const [address] = await this.branchesRepository.listBranchAddresses([id]);

    return {
      data: {
        ...branch,
        address: address
          ? {
              street: address.street,
              area: address.area,
              city: address.city,
              state: address.state,
              country: address.country,
              lat: address.lat,
              lng: address.lng,
            }
          : null,
      },
      message: 'Branch fetched successfully',
    };
  }

  async getOpeningHours(user: AuthUserContext, id: string) {
    const branch = await this.branchesRepository.findById(id);

    if (!branch || branch.deletedAt) {
      throw new BadRequestException('Branch not found');
    }

    this.assertBranchAccess(user, branch);

    return {
      data: this.readOpeningHours(branch.settings),
      message: 'Branch opening hours fetched successfully',
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

    this.assertBranchWriteAccess(user, branch);

    const openingHours = this.normalizeOpeningHours(dto.openingHours);
    const settings = this.readSettings(branch.settings);

    const data = await this.branchesRepository.update(
      id,
      {
        settings: {
          ...settings,
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

  async update(
    _user: AuthUserContext,
    id: string,
    dto: UpdateBranchDto,
    tx?: PrismaTx,
  ) {
    const data = await this.branchesRepository.update(
      id,
      {
        name: dto.name,
        isMain: dto.isMain,
        coverImage: dto.coverImage,
        description: dto.description,
        settings: dto.settings as unknown as Prisma.InputJsonValue,
      },
      tx,
    );

    return {
      data,
      message: 'Branch updated successfully',
    };
  }

  async suspend(_user: AuthUserContext, id: string, tx?: PrismaTx) {
    const data = await this.branchesRepository.setActive(id, false, tx);

    return {
      data,
      message: 'Branch suspended successfully',
    };
  }

  async activate(_user: AuthUserContext, id: string, tx?: PrismaTx) {
    const data = await this.branchesRepository.setActive(id, true, tx);

    return {
      data,
      message: 'Branch activated successfully',
    };
  }

  async updateImages(
    _user: AuthUserContext,
    id: string,
    dto: UpdateBranchImagesDto,
    tx?: PrismaTx,
  ) {
    const data = await this.branchesRepository.update(
      id,
      {
        coverImage: dto.coverImage,
      },
      tx,
    );

    return {
      data,
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

  async forceDelete(user: AuthUserContext, id: string, tx?: PrismaTx) {
    if (
      user.role !== UserRoleEnum.SUPER_ADMIN &&
      user.role !== UserRoleEnum.BUSINESS_ADMIN
    ) {
      throw new ForbiddenException(
        'Only business admin or super admin can force delete branches',
      );
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id },
      select: { id: true, restaurantId: true },
    });

    if (!branch) {
      throw new BadRequestException('Branch not found');
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      const restaurant = await this.prisma.restaurant.findFirst({
        where: { id: branch.restaurantId, tenantId: user.tid, deletedAt: null },
        select: { id: true },
      });

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

  private generateBranchAdminPassword(): string {
    return `Br@${randomBytes(4).toString('hex')}2026`;
  }

  private assertBranchAccess(
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

  private assertBranchWriteAccess(
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
      if (user.rid !== branch.restaurantId) {
        throw new ForbiddenException(
          'You cannot access resources outside your restaurant',
        );
      }

      if (user.bid && user.bid !== branch.id) {
        throw new ForbiddenException(
          'You cannot access resources outside your branch',
        );
      }

      return;
    }

    throw new ForbiddenException(
      'Insufficient permissions for branch opening hours write',
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
              area: address.area,
              city: address.city,
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

  private readSettings(value: unknown): BranchSettingsLike {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as BranchSettingsLike;
  }

  private readOpeningHours(value: unknown): BranchOpeningHourItemDto[] {
    const settings = this.readSettings(value);
    const openingHours = settings.openingHours;

    if (!Array.isArray(openingHours)) {
      return [];
    }

    return this.normalizeOpeningHours(openingHours);
  }

  private normalizeOpeningHours(
    openingHours: BranchOpeningHourItemDto[],
  ): BranchOpeningHourItemDto[] {
    const seenDays = new Set<BranchScheduleDayEnum>();
    const normalized = openingHours.map((item) => {
      if (seenDays.has(item.dayOfWeek)) {
        throw new BadRequestException(
          `Duplicate opening-hours entry for ${item.dayOfWeek}`,
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

      return {
        dayOfWeek: item.dayOfWeek,
        isClosed: false,
        openTime: item.openTime,
        closeTime: item.closeTime,
        ...(note ? { note } : {}),
      };
    });

    return normalized.sort(
      (a, b) =>
        BRANCH_OPENING_DAY_ORDER.indexOf(a.dayOfWeek) -
        BRANCH_OPENING_DAY_ORDER.indexOf(b.dayOfWeek),
    );
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
