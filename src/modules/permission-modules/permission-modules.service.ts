import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildPaginationMeta } from '../../common/utils';
import {
  CreatePermissionModuleDto,
  ListPermissionModulesDto,
  UpdatePermissionModuleDto,
} from './dto';
import { PermissionModulesRepository } from './permission-modules.repository';

@Injectable()
export class PermissionModulesService {
  constructor(
    private readonly permissionModulesRepository: PermissionModulesRepository,
  ) {}

  async create(dto: CreatePermissionModuleDto) {
    const accessKey = this.normalizeAccessKey(dto.accessKey);
    await this.assertAccessKeyAvailable(accessKey);

    const data = await this.permissionModulesRepository.create({
      accessKey,
      name: dto.name.trim(),
      description: this.optionalText(dto.description),
      defaultActions: this.normalizeActions(
        dto.defaultActions,
      ) as Prisma.InputJsonValue,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return { data, message: 'Permission module created successfully' };
  }

  async list(query: ListPermissionModulesDto) {
    const where: Prisma.PermissionModuleWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { accessKey: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const { items, total } = await this.permissionModulesRepository.list(
      where,
      query,
    );

    return {
      data: items,
      message: 'Permission modules fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(id: string) {
    const data = await this.permissionModulesRepository.findById(id);
    if (!data) {
      throw new NotFoundException('Permission module not found');
    }

    return { data, message: 'Permission module fetched successfully' };
  }

  async update(id: string, dto: UpdatePermissionModuleDto) {
    await this.details(id);
    const data = await this.permissionModulesRepository.update(id, {
      name: dto.name?.trim(),
      description:
        dto.description !== undefined
          ? this.optionalText(dto.description)
          : undefined,
      defaultActions:
        dto.defaultActions !== undefined
          ? (this.normalizeActions(dto.defaultActions) as Prisma.InputJsonValue)
          : undefined,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
    });

    return { data, message: 'Permission module updated successfully' };
  }

  async validateActiveAccessKeys(accessKeys: string[]) {
    const normalized = [
      ...new Set(accessKeys.map((key) => this.normalizeAccessKey(key))),
    ];
    if (!normalized.length) {
      return;
    }

    const active =
      await this.permissionModulesRepository.listActiveByAccessKeys(normalized);
    const activeModulesByKey = new Map(
      active.map((item) => [
        item.accessKey,
        new Set(this.readActions(item.defaultActions)),
      ]),
    );
    const activeKeys = new Set(activeModulesByKey.keys());
    const missing = normalized.filter((key) => !activeKeys.has(key));

    if (missing.length) {
      throw new BadRequestException(
        `Unknown or inactive permission module(s): ${missing.join(', ')}`,
      );
    }
  }

  async validateActivePermissions(
    permissions: Array<{ access: string; operations: string[] }>,
  ) {
    const accessKeys = [...new Set(permissions.map((item) => item.access))];
    if (!accessKeys.length) {
      return;
    }

    const active =
      await this.permissionModulesRepository.listActiveByAccessKeys(accessKeys);
    const activeModulesByKey = new Map(
      active.map((item) => [
        item.accessKey,
        new Set(this.readActions(item.defaultActions)),
      ]),
    );
    const missing = accessKeys.filter((key) => !activeModulesByKey.has(key));

    if (missing.length) {
      throw new BadRequestException(
        `Unknown or inactive permission module(s): ${missing.join(', ')}`,
      );
    }

    const invalidOperations = permissions.flatMap((permission) => {
      const allowed =
        activeModulesByKey.get(permission.access) ?? new Set<string>();
      return permission.operations
        .filter((operation) => operation !== '*' && !allowed.has(operation))
        .map((operation) => `${permission.access}:${operation}`);
    });

    if (invalidOperations.length) {
      throw new BadRequestException(
        `Unsupported permission operation(s): ${invalidOperations.join(', ')}`,
      );
    }
  }

  private async assertAccessKeyAvailable(accessKey: string) {
    const existing =
      await this.permissionModulesRepository.findByAccessKey(accessKey);
    if (existing) {
      throw new BadRequestException(
        'Permission module access key already exists',
      );
    }
  }

  private normalizeAccessKey(value: string) {
    const accessKey = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-_]{1,119}$/.test(accessKey)) {
      throw new BadRequestException(
        'Permission module access key must use lowercase letters, numbers, dashes, or underscores',
      );
    }
    return accessKey;
  }

  private normalizeActions(actions?: string[]) {
    const normalized = [
      ...new Set(
        (actions?.length ? actions : ['read', 'write'])
          .map((action) => action.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    if (!normalized.length) {
      throw new BadRequestException(
        'Permission module must define at least one action',
      );
    }
    return normalized;
  }

  private readActions(value: Prisma.JsonValue) {
    return Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      : [];
  }

  private optionalText(value?: string) {
    const text = value?.trim();
    return text ? text : null;
  }
}
