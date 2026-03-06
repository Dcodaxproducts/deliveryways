import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminListQueryDto } from '../../common/dto';
import { AuthUserContext } from '../../common/decorators';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaTx } from '../../common/types';
import { AddressesRepository } from './addresses.repository';
import { CreateAddressDto, UpdateAddressDto } from './dto';

@Injectable()
export class AddressesService {
  constructor(private readonly addressesRepository: AddressesRepository) {}

  async create(user: AuthUserContext, dto: CreateAddressDto, tx?: PrismaTx) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    return this.addressesRepository.create(
      {
        tenantId: user.tid,
        referenceId: dto.referenceId,
        refType: dto.refType,
        street: dto.street,
        area: dto.area,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        lat: dto.lat ? new Prisma.Decimal(dto.lat) : undefined,
        lng: dto.lng ? new Prisma.Decimal(dto.lng) : undefined,
      },
      tx,
    );
  }

  async list(
    user: AuthUserContext,
    referenceId: string,
    query: AdminListQueryDto,
  ) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const withDeleted = user.role === 'SUPER_ADMIN' && !!query.withDeleted;
    const includeInactive =
      (user.role === 'SUPER_ADMIN' ||
        user.role === 'BUSINESS_ADMIN' ||
        user.role === 'BRANCH_ADMIN') &&
      !!query.includeInactive;

    const { items, total } = await this.addressesRepository.listByReference(
      user.tid,
      referenceId,
      query,
      withDeleted,
      includeInactive,
    );

    return {
      data: items,
      message: 'Addresses fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async update(
    user: AuthUserContext,
    id: string,
    dto: UpdateAddressDto,
    tx?: PrismaTx,
  ) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const data = await this.addressesRepository.update(
      id,
      {
        street: dto.street,
        area: dto.area,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        lat: dto.lat ? new Prisma.Decimal(dto.lat) : undefined,
        lng: dto.lng ? new Prisma.Decimal(dto.lng) : undefined,
      },
      tx,
    );

    return {
      data,
      message: 'Address updated successfully',
    };
  }

  async remove(user: AuthUserContext, id: string, tx?: PrismaTx) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const data = await this.addressesRepository.softDelete(id, tx);
    return {
      data,
      message: 'Address soft deleted successfully',
    };
  }
}
