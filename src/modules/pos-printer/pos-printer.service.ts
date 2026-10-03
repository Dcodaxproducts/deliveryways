import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StaffAccountType, StaffPanelType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import {
  CreatePosPrinterAccountDto,
  ResetPosPrinterPasswordDto,
  UpdatePosPrinterStatusDto,
} from './dto';
import { PosPrinterRepository } from './pos-printer.repository';

@Injectable()
export class PosPrinterService {
  constructor(private readonly repository: PosPrinterRepository) {}

  async create(user: AuthUserContext, dto: CreatePosPrinterAccountDto) {
    const branchId = this.resolveRequestedBranchId(user, dto.branchId);
    const branch = await this.repository.findBranch(branchId);
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    this.assertBranchScope(user, branch);

    const username = dto.username?.trim();
    const usernameNormalized = username?.toLowerCase();
    const requestedEmail = dto.email?.trim().toLowerCase();
    if (!usernameNormalized && !requestedEmail) {
      throw new BadRequestException('username or email is required');
    }

    const [existingUsername, existingEmail] = await Promise.all([
      usernameNormalized
        ? this.repository.findByUsernameNormalized(usernameNormalized)
        : Promise.resolve(null),
      requestedEmail
        ? this.repository.findByEmail(requestedEmail)
        : Promise.resolve(null),
    ]);
    if (existingUsername || existingEmail) {
      throw new ConflictException('Login identifier is unavailable');
    }

    const displayName =
      dto.displayName?.trim() ||
      [dto.firstName?.trim(), dto.lastName?.trim()].filter(Boolean).join(' ') ||
      username ||
      requestedEmail!;
    const nameParts = displayName.split(/\s+/);
    const firstName = dto.firstName?.trim() || nameParts[0] || 'Printer';
    const lastName =
      dto.lastName?.trim() || nameParts.slice(1).join(' ') || 'Device';
    const email =
      requestedEmail ||
      `pos-${randomBytes(12).toString('hex')}@pos-device.invalid`;

    let data: Awaited<ReturnType<PosPrinterRepository['create']>>;
    try {
      data = await this.repository.create({
        ownerUserId: this.resolveOwnerUserId(user),
        panelType: this.resolvePanelType(user),
        tenantId: branch.tenantId,
        restaurantId: branch.restaurantId,
        branchId: branch.id,
        email,
        username,
        usernameNormalized,
        displayName,
        password: await bcrypt.hash(dto.password, 10),
        firstName,
        lastName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Login identifier is unavailable');
      }
      throw error;
    }

    return {
      data: this.toResponse(data),
      message: 'POS printer account created successfully',
    };
  }

  async list(user: AuthUserContext) {
    const where = this.buildScopeWhere(user);
    const accounts = await this.repository.list(where);
    return {
      data: accounts.map((account) => this.toResponse(account)),
      message: 'POS printer accounts fetched successfully',
    };
  }

  async listBranches(user: AuthUserContext) {
    const branches = await this.repository.listBranches(
      this.buildBranchScopeWhere(user),
    );
    return {
      data: branches,
      message: 'POS printer branches fetched successfully',
    };
  }

  async updateStatus(
    user: AuthUserContext,
    id: string,
    dto: UpdatePosPrinterStatusDto,
  ) {
    await this.getAccessibleAccount(user, id);
    const data = await this.repository.update(id, {
      isActive: dto.isActive,
      refreshTokenHash: null,
      authVersion: { increment: 1 },
    });
    await this.repository.deactivatePushTokens(id);
    return {
      data: this.toResponse(data),
      message: 'POS printer account status updated successfully',
    };
  }

  async resetPassword(
    user: AuthUserContext,
    id: string,
    dto: ResetPosPrinterPasswordDto,
  ) {
    await this.getAccessibleAccount(user, id);
    await this.repository.update(id, {
      password: await bcrypt.hash(dto.newPassword, 10),
      plainPassword: null,
      refreshTokenHash: null,
      authVersion: { increment: 1 },
    });
    await this.repository.deactivatePushTokens(id);
    return { data: null, message: 'POS printer password reset successfully' };
  }

  private async getAccessibleAccount(user: AuthUserContext, id: string) {
    const account = await this.repository.findById(id);
    if (!account || account.deletedAt) {
      throw new NotFoundException('POS printer account not found');
    }
    if (account.ownerUserId !== this.resolveOwnerUserId(user)) {
      throw new ForbiddenException(
        'You cannot manage POS printer accounts created by another admin',
      );
    }
    this.assertBranchScope(user, account);
    return account;
  }

  private buildScopeWhere(user: AuthUserContext): Prisma.StaffUserWhereInput {
    if (user.role === UserRoleEnum.BUSINESS_ADMIN && user.tid) {
      return {
        ownerUserId: user.uid,
        tenantId: user.tid,
        accountType: StaffAccountType.POS_PRINTER,
        deletedAt: null,
      };
    }
    if (
      user.role === UserRoleEnum.BRANCH_ADMIN &&
      user.tid &&
      user.rid &&
      user.bid
    ) {
      return {
        ownerUserId: user.uid,
        tenantId: user.tid,
        restaurantId: user.rid,
        branchId: user.bid,
        accountType: StaffAccountType.POS_PRINTER,
        deletedAt: null,
      };
    }
    if (user.role === UserRoleEnum.STAFF && user.ownerUserId) {
      const scope = this.resolveStaffScope(user);
      return {
        ownerUserId: user.ownerUserId,
        ...(user.tid ? { tenantId: user.tid } : {}),
        accountType: StaffAccountType.POS_PRINTER,
        deletedAt: null,
        ...this.buildStaffScopeFilter(scope, 'branchId'),
      };
    }
    throw new ForbiddenException('Restaurant admin scope is required');
  }

  private buildBranchScopeWhere(
    user: AuthUserContext,
  ): Prisma.BranchWhereInput {
    if (user.role === UserRoleEnum.BUSINESS_ADMIN && user.tid) {
      return { tenantId: user.tid };
    }
    if (user.role === UserRoleEnum.BRANCH_ADMIN && user.tid && user.bid) {
      return { tenantId: user.tid, id: user.bid };
    }
    if (user.role === UserRoleEnum.STAFF && user.ownerUserId) {
      const scope = this.resolveStaffScope(user);
      return {
        ...(user.tid ? { tenantId: user.tid } : {}),
        ...this.buildStaffScopeFilter(scope, 'id'),
      };
    }
    throw new ForbiddenException('Restaurant admin scope is required');
  }

  private resolveRequestedBranchId(
    user: AuthUserContext,
    requestedBranchId?: string,
  ): string {
    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.bid) {
        throw new ForbiddenException('Branch context is required');
      }
      if (requestedBranchId && requestedBranchId !== user.bid) {
        throw new ForbiddenException(
          'Branch admins can only provision their own branch',
        );
      }
      return user.bid;
    }
    if (user.role === UserRoleEnum.BUSINESS_ADMIN && requestedBranchId) {
      return requestedBranchId;
    }
    if (user.role === UserRoleEnum.STAFF) {
      const branchId = requestedBranchId ?? user.bid;
      if (branchId) {
        return branchId;
      }
    }
    throw new BadRequestException('branchId is required');
  }

  private assertBranchScope(
    user: AuthUserContext,
    branch: {
      tenantId: string | null;
      restaurantId: string | null;
      id?: string;
      branchId?: string | null;
    },
  ): void {
    const branchId = branch.id ?? branch.branchId;
    if (!user.tid || branch.tenantId !== user.tid) {
      throw new ForbiddenException('Branch is outside your tenant scope');
    }
    if (
      user.role === UserRoleEnum.BRANCH_ADMIN &&
      (branchId !== user.bid || branch.restaurantId !== user.rid)
    ) {
      throw new ForbiddenException(
        'Branch admins can only manage their own branch',
      );
    }
    if (user.role === UserRoleEnum.STAFF) {
      const scope = this.resolveStaffScope(user);
      if (
        !scope.hasAllRestaurantsAccess &&
        !scope.branchIds.includes(branchId ?? '') &&
        !scope.restaurantIds.includes(branch.restaurantId ?? '')
      ) {
        throw new ForbiddenException('Branch is outside your staff scope');
      }
    }
  }

  private resolvePanelType(user: AuthUserContext): StaffPanelType {
    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      return StaffPanelType.BUSINESS_ADMIN;
    }
    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      return StaffPanelType.BRANCH_ADMIN;
    }
    if (
      user.role === UserRoleEnum.STAFF &&
      user.panelType &&
      Object.values(StaffPanelType).includes(user.panelType as StaffPanelType)
    ) {
      return user.panelType as StaffPanelType;
    }
    throw new ForbiddenException('Restaurant admin scope is required');
  }

  private resolveOwnerUserId(user: AuthUserContext): string {
    return user.role === UserRoleEnum.STAFF
      ? (user.ownerUserId ?? user.uid)
      : user.uid;
  }

  private resolveStaffScope(user: AuthUserContext) {
    const branchIds = [
      user.bid,
      ...(user.restaurantAccess?.branchIds ?? []),
    ].filter((id): id is string => Boolean(id));
    const restaurantIds = [
      user.rid,
      ...(user.restaurantAccess?.restaurantIds ?? []),
    ].filter((id): id is string => Boolean(id));
    const hasAllRestaurantsAccess = Boolean(
      user.restaurantAccess?.allRestaurants ||
      user.restaurantAccess?.hasAllRestaurantsAccess,
    );
    if (
      !hasAllRestaurantsAccess &&
      !branchIds.length &&
      !restaurantIds.length
    ) {
      throw new ForbiddenException('Restaurant staff scope is required');
    }
    return { branchIds, restaurantIds, hasAllRestaurantsAccess };
  }

  private buildStaffScopeFilter(
    scope: ReturnType<PosPrinterService['resolveStaffScope']>,
    branchField: 'id' | 'branchId',
  ) {
    if (scope.hasAllRestaurantsAccess) {
      return {};
    }
    return {
      OR: [
        ...(scope.branchIds.length
          ? [{ [branchField]: { in: scope.branchIds } }]
          : []),
        ...(scope.restaurantIds.length
          ? [{ restaurantId: { in: scope.restaurantIds } }]
          : []),
      ],
    };
  }

  private toResponse(account: {
    id: string;
    email: string;
    username: string | null;
    displayName: string | null;
    firstName: string;
    lastName: string;
    accountType: StaffAccountType;
    tenantId: string | null;
    restaurantId: string | null;
    branchId: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    branch: { id: string; name: string } | null;
  }) {
    return {
      id: account.id,
      email: account.email.endsWith('@pos-device.invalid')
        ? null
        : account.email,
      username: account.username,
      displayName: account.displayName,
      firstName: account.firstName,
      lastName: account.lastName,
      accountType: account.accountType,
      tenantId: account.tenantId,
      restaurantId: account.restaurantId,
      branchId: account.branchId,
      branch: account.branch,
      isActive: account.isActive,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
}
