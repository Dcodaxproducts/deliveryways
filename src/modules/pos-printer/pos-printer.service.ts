import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StaffAccountType, StaffPanelType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
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

    const email = dto.email.trim().toLowerCase();
    const existing = await this.repository.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email is unavailable');
    }

    let data: Awaited<ReturnType<PosPrinterRepository['create']>>;
    try {
      data = await this.repository.create({
        ownerUserId: user.uid,
        panelType: this.resolvePanelType(user),
        tenantId: branch.tenantId,
        restaurantId: branch.restaurantId,
        branchId: branch.id,
        email,
        password: await bcrypt.hash(dto.password, 10),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email is unavailable');
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
    return { data: null, message: 'POS printer password reset successfully' };
  }

  private async getAccessibleAccount(user: AuthUserContext, id: string) {
    const account = await this.repository.findById(id);
    if (!account || account.deletedAt) {
      throw new NotFoundException('POS printer account not found');
    }
    if (account.ownerUserId !== user.uid) {
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
  }

  private resolvePanelType(user: AuthUserContext): StaffPanelType {
    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      return StaffPanelType.BUSINESS_ADMIN;
    }
    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      return StaffPanelType.BRANCH_ADMIN;
    }
    throw new ForbiddenException('Restaurant admin scope is required');
  }

  private toResponse(account: {
    id: string;
    email: string;
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
      email: account.email,
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
