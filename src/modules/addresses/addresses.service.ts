import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaTx } from '../../common/types';
import { AddressesRepository } from './addresses.repository';
import { CreateAddressDto, ListAddressesDto, UpdateAddressDto } from './dto';

@Injectable()
export class AddressesService {
  constructor(private readonly addressesRepository: AddressesRepository) {}

  async create(user: AuthUserContext, dto: CreateAddressDto, tx?: PrismaTx) {
    const tenantId = this.getRequiredTenantId(user);

    const data = await this.addressesRepository.create(
      {
        tenantId,
        referenceId: user.uid,
        refType: 'USER',
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
      message: 'Address created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListAddressesDto) {
    const tenantId = this.getRequiredTenantId(user);

    const { items, total } = await this.addressesRepository.listForUser(
      tenantId,
      user.uid,
      query,
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
    const existingAddress = await this.getOwnedAddressOrThrow(user, id);

    const data = await this.addressesRepository.update(
      existingAddress.id,
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
    const existingAddress = await this.getOwnedAddressOrThrow(user, id);

    const data = await this.addressesRepository.softDelete(
      existingAddress.id,
      tx,
    );
    return {
      data,
      message: 'Address deleted successfully',
    };
  }

  private async getOwnedAddressOrThrow(user: AuthUserContext, id: string) {
    const tenantId = this.getRequiredTenantId(user);
    const address = await this.addressesRepository.findUserAddressById(
      id,
      tenantId,
      user.uid,
    );

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    return address;
  }

  private getRequiredTenantId(user: AuthUserContext) {
    if (!user.tid) {
      throw new ForbiddenException('Your account is missing tenant context');
    }

    return user.tid;
  }
}
