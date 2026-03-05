import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTx } from '../../common/types';
import { CreateProfileDto, UpdateProfileDto } from './dto';
import { ProfilesRepository } from './profiles.repository';

@Injectable()
export class ProfilesService {
  constructor(private readonly profilesRepository: ProfilesRepository) {}

  async create(dto: CreateProfileDto, tx?: PrismaTx) {
    return this.profilesRepository.create(
      {
        user: { connect: { id: dto.userId } },
        firstName: dto.firstName,
        lastName: dto.lastName,
        avatarUrl: dto.avatarUrl,
        phone: dto.phone,
        bio: dto.bio,
        metadata: dto.metadata as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  async update(id: string, dto: UpdateProfileDto, tx?: PrismaTx) {
    return this.profilesRepository.update(
      id,
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        avatarUrl: dto.avatarUrl,
        phone: dto.phone,
        bio: dto.bio,
        metadata: dto.metadata as Prisma.InputJsonValue,
      },
      tx,
    );
  }
}
