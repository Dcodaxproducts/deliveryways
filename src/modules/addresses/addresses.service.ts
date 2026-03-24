import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaTx } from '../../common/types';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { AddressesRepository } from './addresses.repository';
import { CreateAddressDto, ListAddressesDto, UpdateAddressDto } from './dto';

@Injectable()
export class AddressesService {
  constructor(
    private readonly addressesRepository: AddressesRepository,
    private readonly profilesRepository: ProfilesRepository,
  ) {}

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

    const currentDefaultAddressId = await this.getDefaultAddressId(user.uid);
    if (dto.isDefault || !currentDefaultAddressId) {
      await this.setDefaultAddressId(user.uid, data.id);
    }

    return {
      data: {
        ...data,
        isDefault: dto.isDefault || !currentDefaultAddressId,
      },
      message: 'Address created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListAddressesDto) {
    const tenantId = this.getRequiredTenantId(user);
    const defaultAddressId = await this.getDefaultAddressId(user.uid);

    const { items, total } = await this.addressesRepository.listForUser(
      tenantId,
      user.uid,
      query,
    );

    return {
      data: items.map((item) => ({
        ...item,
        isDefault: item.id === defaultAddressId,
      })),
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

    if (dto.isDefault) {
      await this.setDefaultAddressId(user.uid, data.id);
    }

    return {
      data: {
        ...data,
        isDefault:
          dto.isDefault ??
          (await this.getDefaultAddressId(user.uid)) === data.id,
      },
      message: 'Address updated successfully',
    };
  }

  async remove(user: AuthUserContext, id: string, tx?: PrismaTx) {
    const existingAddress = await this.getOwnedAddressOrThrow(user, id);
    const defaultAddressId = await this.getDefaultAddressId(user.uid);

    const data = await this.addressesRepository.softDelete(
      existingAddress.id,
      tx,
    );

    if (defaultAddressId === existingAddress.id) {
      await this.setDefaultAddressId(user.uid, null);
    }

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

  private async getDefaultAddressId(userId: string) {
    const profile = await this.profilesRepository.findByUserId(userId);
    const metadata = this.asObject(profile?.metadata);

    return typeof metadata.defaultAddressId === 'string'
      ? metadata.defaultAddressId
      : null;
  }

  private async setDefaultAddressId(userId: string, addressId: string | null) {
    const profile = await this.profilesRepository.findByUserId(userId);
    const metadata = this.asObject(profile?.metadata);

    const nextMetadata = {
      ...metadata,
      defaultAddressId: addressId,
    } as Prisma.InputJsonValue;

    await this.profilesRepository.upsertMetadata(userId, nextMetadata);
  }

  private asObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private getRequiredTenantId(user: AuthUserContext) {
    if (!user.tid) {
      throw new ForbiddenException('Your account is missing tenant context');
    }

    return user.tid;
  }
}
