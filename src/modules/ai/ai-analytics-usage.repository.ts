import { Injectable } from '@nestjs/common';
import { AiAnalyticsUsageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database';
import {
  AnalyticsCopilotResponse,
  AnalyticsDateRange,
  AnalyticsScope,
} from './domain/analytics-copilot.types';

@Injectable()
export class AiAnalyticsUsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByRequest(scope: AnalyticsScope, requestId: string) {
    return this.prisma.aiAnalyticsUsage.findUnique({
      where: {
        tenantId_restaurantId_requestId: {
          tenantId: scope.tenantId,
          restaurantId: scope.restaurantId,
          requestId,
        },
      },
    });
  }

  async reserve(input: {
    scope: AnalyticsScope;
    actorId: string;
    actorRole: string;
    requestId: string;
    intent: string;
    range: AnalyticsDateRange;
    comparison: AnalyticsDateRange | null;
    timezone: string;
    locale: string;
    questionHash: string;
    promptVersion: string;
    expiresAt: Date;
  }) {
    const existing = await this.findByRequest(input.scope, input.requestId);
    if (existing) return { record: existing, created: false };
    try {
      const record = await this.prisma.aiAnalyticsUsage.create({
        data: {
          tenantId: input.scope.tenantId,
          restaurantId: input.scope.restaurantId,
          branchId: input.scope.branchId,
          actorId: input.actorId,
          actorRole: input.actorRole,
          requestId: input.requestId,
          intent: input.intent,
          periodFrom: input.range.startUtc,
          periodToExclusive: input.range.endExclusiveUtc,
          comparisonFrom: input.comparison?.startUtc,
          comparisonTo: input.comparison?.endExclusiveUtc,
          timezone: input.timezone,
          locale: input.locale,
          questionHash: input.questionHash,
          promptVersion: input.promptVersion,
          expiresAt: input.expiresAt,
        },
      });
      return { record, created: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.findByRequest(
          input.scope,
          input.requestId,
        );
        if (duplicate) return { record: duplicate, created: false };
      }
      throw error;
    }
  }

  getDailyUsage(scope: AnalyticsScope, startUtc: Date) {
    return this.prisma.aiAnalyticsUsage.aggregate({
      where: {
        tenantId: scope.tenantId,
        restaurantId: scope.restaurantId,
        createdAt: { gte: startUtc },
      },
      _count: { id: true },
      _sum: { inputTokens: true, outputTokens: true, estimatedCostMicro: true },
    });
  }

  complete(
    id: string,
    input: {
      status: AiAnalyticsUsageStatus;
      response: AnalyticsCopilotResponse;
      snapshotHash: string;
      fallbackReason?: string;
      provider?: string;
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
      estimatedCostMicro?: number;
      latencyMs: number;
    },
  ) {
    const response = JSON.parse(
      JSON.stringify(input.response),
    ) as Prisma.InputJsonValue;
    return this.prisma.aiAnalyticsUsage.update({
      where: { id },
      data: {
        status: input.status,
        response,
        snapshotHash: input.snapshotHash,
        fallbackReason: input.fallbackReason,
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens ?? 0,
        outputTokens: input.outputTokens ?? 0,
        estimatedCostMicro: input.estimatedCostMicro ?? 0,
        latencyMs: input.latencyMs,
      },
    });
  }

  fail(id: string, errorCode: string, latencyMs: number) {
    return this.prisma.aiAnalyticsUsage.update({
      where: { id },
      data: { status: AiAnalyticsUsageStatus.FAILED, errorCode, latencyMs },
    });
  }

  async deleteExpired(limit = 500) {
    const rows = await this.prisma.aiAnalyticsUsage.findMany({
      where: { expiresAt: { lt: new Date() } },
      orderBy: { expiresAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    if (rows.length === 0) return 0;
    const result = await this.prisma.aiAnalyticsUsage.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    return result.count;
  }
}
