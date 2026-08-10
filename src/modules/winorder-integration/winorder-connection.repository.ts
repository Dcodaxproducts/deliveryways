import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database';

export interface WinOrderConnectionScope {
  tenantId: string;
  restaurantId: string;
  branchId: string;
}

@Injectable()
export class WinOrderConnectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBranch(branchId: string) {
    return this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { id: true, tenantId: true, restaurantId: true, name: true },
    });
  }

  findByBranch(scope: WinOrderConnectionScope) {
    return this.prisma.winOrderConnection.findFirst({
      where: scope,
      select: this.safeConnectionSelect(),
    });
  }

  findAuthenticationRecord(username: string) {
    return this.prisma.winOrderConnection.findFirst({
      where: { username, isEnabled: true },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
        storeId: true,
        passwordHash: true,
      },
    });
  }

  create(
    scope: WinOrderConnectionScope,
    data: {
      username: string;
      passwordHash: string;
      storeId: number;
      storeName?: string;
      actorId: string;
    },
  ) {
    return this.prisma.winOrderConnection.create({
      data: {
        ...scope,
        username: data.username,
        passwordHash: data.passwordHash,
        storeId: data.storeId,
        storeName: data.storeName,
        createdBy: data.actorId,
        updatedBy: data.actorId,
      },
      select: this.safeConnectionSelect(),
    });
  }

  update(
    scope: WinOrderConnectionScope,
    data: {
      storeId?: number;
      storeName?: string;
      isEnabled?: boolean;
      actorId: string;
    },
  ) {
    return this.prisma.winOrderConnection.updateMany({
      where: scope,
      data: {
        storeId: data.storeId,
        storeName: data.storeName,
        isEnabled: data.isEnabled,
        updatedBy: data.actorId,
      },
    });
  }

  rotate(
    scope: WinOrderConnectionScope,
    data: {
      username: string;
      passwordHash: string;
      actorId: string;
    },
  ) {
    return this.prisma.winOrderConnection.updateMany({
      where: scope,
      data: {
        username: data.username,
        passwordHash: data.passwordHash,
        credentialVersion: { increment: 1 },
        isEnabled: true,
        updatedBy: data.actorId,
      },
    });
  }

  private safeConnectionSelect(): Prisma.WinOrderConnectionSelect {
    return {
      id: true,
      tenantId: true,
      restaurantId: true,
      branchId: true,
      username: true,
      credentialVersion: true,
      storeId: true,
      storeName: true,
      isEnabled: true,
      lastPollAt: true,
      lastSuccessfulCallbackAt: true,
      lastErrorAt: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    };
  }
}
