import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database';
import { ListPermissionModulesDto } from './dto';

@Injectable()
export class PermissionModulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.PermissionModuleCreateInput) {
    return this.prisma.permissionModule.create({ data });
  }

  async findById(id: string) {
    return this.prisma.permissionModule.findUnique({ where: { id } });
  }

  async findByAccessKey(accessKey: string) {
    return this.prisma.permissionModule.findUnique({ where: { accessKey } });
  }

  async list(
    where: Prisma.PermissionModuleWhereInput,
    query: ListPermissionModulesDto,
  ) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.permissionModule.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.permissionModule.count({ where }),
    ]);

    return { items, total };
  }

  async listActiveByAccessKeys(accessKeys: string[]) {
    return this.prisma.permissionModule.findMany({
      where: { accessKey: { in: accessKeys }, isActive: true },
      select: { accessKey: true, defaultActions: true },
    });
  }

  async update(id: string, data: Prisma.PermissionModuleUpdateInput) {
    return this.prisma.permissionModule.update({ where: { id }, data });
  }

  async deactivate(id: string) {
    return this.prisma.permissionModule.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
