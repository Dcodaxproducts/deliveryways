import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { AdminListQueryDto, QueryDto } from '../../common/dto';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { PrismaTx } from '../../common/types';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaService } from '../../database';
import { UsersService } from '../users/users.service';
import { BranchesRepository } from './branches.repository';
import { CreateBranchDto, UpdateBranchDto } from './dto';

@Injectable()
export class BranchesService {
  constructor(
    private readonly branchesRepository: BranchesRepository,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  async create(tenantId: string, dto: CreateBranchDto, tx?: PrismaTx) {
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

    if (!dto.branchAdmin) {
      const data = await this.create(user.tid, dto, tx);
      return {
        data,
        message: 'Branch created successfully',
      };
    }

    const existingBranchAdmin = await this.usersService.findByEmail(
      dto.branchAdmin.email,
      dto.restaurantId,
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
      const branch = await this.create(user.tid as string, dto, trx);

      const branchAdmin = await this.usersService.create(
        {
          email: branchAdminInput.email,
          password: await bcrypt.hash(plainPassword, 10),
          role: UserRoleEnum.BRANCH_ADMIN,
          tenantId: user.tid,
          restaurantId: dto.restaurantId,
          branchId: branch.id,
          isVerified: true,
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

  async list(
    user: AuthUserContext,
    restaurantId: string,
    query: AdminListQueryDto,
  ) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    if (user.role === 'BRANCH_ADMIN' && user.bid) {
      const items = await this.branchesRepository.listByBranchId(user.bid);
      return {
        data: items,
        message: 'Branch admin scope applied',
        meta: {
          page: 1,
          limit: items.length,
          total: items.length,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      };
    }

    const allowWithDeleted = user.role === 'SUPER_ADMIN' && !!query.withDeleted;
    const includeInactive =
      (user.role === 'SUPER_ADMIN' ||
        user.role === 'BUSINESS_ADMIN' ||
        user.role === 'BRANCH_ADMIN') &&
      !!query.includeInactive;

    const { items, total } = await this.branchesRepository.listByRestaurant(
      user.tid,
      restaurantId,
      query,
      false,
      allowWithDeleted,
      includeInactive,
    );

    return {
      data: items,
      message: 'Branches fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async listPublic(tenantId: string, restaurantId: string, query: QueryDto) {
    const { items, total } = await this.branchesRepository.listByRestaurant(
      tenantId,
      restaurantId,
      query,
      true,
    );

    return {
      data: items,
      message: 'Public branches fetched successfully',
      meta: buildPaginationMeta(query, total),
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

  async remove(_user: AuthUserContext, id: string, tx?: PrismaTx) {
    const data = await this.branchesRepository.softDelete(id, tx);

    return {
      data,
      message: 'Branch soft deleted successfully',
    };
  }

  private generateBranchAdminPassword(): string {
    return `Br@${randomBytes(4).toString('hex')}2026`;
  }
}
