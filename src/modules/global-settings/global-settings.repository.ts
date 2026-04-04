import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database';

@Injectable()
export class GlobalSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSingleton() {
    return this.prisma.globalSetting.findUnique({
      where: { scopeKey: 'GLOBAL' },
    });
  }

  async ensureSingleton(data: Prisma.GlobalSettingCreateInput) {
    return this.prisma.globalSetting.upsert({
      where: { scopeKey: 'GLOBAL' },
      update: {},
      create: data,
    });
  }

  async updateSingleton(
    update: Prisma.GlobalSettingUpdateInput,
    create: Prisma.GlobalSettingCreateInput,
  ) {
    return this.prisma.globalSetting.upsert({
      where: { scopeKey: 'GLOBAL' },
      update,
      create,
    });
  }
}
