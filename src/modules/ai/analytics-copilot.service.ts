import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAnalyticsUsageStatus } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { GlobalSettingsService } from '../global-settings/global-settings.service';
import { AiAnalyticsUsageRepository } from './ai-analytics-usage.repository';
import { AnalyticsCopilotRepository } from './analytics-copilot.repository';
import { AnalyticsDateRangeService } from './analytics-date-range.service';
import {
  AnalyticsCopilotQueryDto,
  AnalyticsCapabilitiesQueryDto,
} from './dto/analytics-copilot.dto';
import {
  AI_TEXT_PROVIDER,
  AiTextProvider,
  AnalyticsCopilotResponse,
  AnalyticsDateRange,
  AnalyticsExplanation,
  AnalyticsIntent,
  AnalyticsMetric,
  AnalyticsPeriodSnapshot,
  AnalyticsProviderSnapshot,
  AnalyticsScope,
} from './domain/analytics-copilot.types';
import { ANALYTICS_PROMPT_VERSION } from './prompts/analytics.prompt';
import { AiProviderError } from './providers/ai-provider.error';
import { validateAnalyticsExplanation } from './providers/analytics-output.validator';

interface AnalyticsConfig {
  enabled: boolean;
  provider: string;
  model: string;
  timeoutMs: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostMicroUsdPerRequest: number;
  dailyRestaurantRequestLimit: number;
  dailyRestaurantTokenLimit: number;
  dailyRestaurantCostMicroUsdLimit: number;
  maxProviderConcurrency: number;
  retentionDays: number;
  inputCostMicroUsdPerMillionTokens: number;
  outputCostMicroUsdPerMillionTokens: number;
}

@Injectable()
export class AnalyticsCopilotService {
  private readonly logger = new Logger(AnalyticsCopilotService.name);
  private readonly activeRequests = new Set<string>();
  private providerActive = 0;
  constructor(
    private readonly configService: ConfigService,
    private readonly repository: AnalyticsCopilotRepository,
    private readonly usageRepository: AiAnalyticsUsageRepository,
    private readonly rangeService: AnalyticsDateRangeService,
    private readonly globalSettingsService: GlobalSettingsService,
    @Inject(AI_TEXT_PROVIDER) private readonly provider: AiTextProvider,
  ) {}
  async getCapabilities(
    user: AuthUserContext,
    query: AnalyticsCapabilitiesQueryDto,
  ) {
    await this.resolveScope(user, query.restaurantId, query.branchId);
    const config = this.config();
    return {
      data: {
        enabled: config.enabled,
        available: config.enabled,
        providerConfigured: config.enabled && this.provider.isConfigured(),
        deterministicFallbackAvailable: config.enabled,
        readOnly: true,
        supportedIntents: Object.values(AnalyticsIntent),
        supportedPeriods: ['LAST_7_DAYS', 'LAST_30_DAYS', 'CUSTOM'],
        maxPeriodDays: 366,
        examples: [
          'Why did revenue change in this period?',
          'When were our busiest hours?',
          'Which items were most popular?',
          'How many orders were cancelled?',
        ],
      },
      message: 'Analytics Copilot capabilities fetched successfully',
    };
  }

  async query(user: AuthUserContext, dto: AnalyticsCopilotQueryDto) {
    const config = this.config();
    if (!config.enabled)
      throw new ServiceUnavailableException({
        code: 'AI_ANALYTICS_DISABLED',
        message: 'Analytics Copilot is disabled',
      });
    const scope = await this.resolveScope(user, dto.restaurantId, dto.branchId);
    const activeKey = [scope.tenantId, scope.restaurantId, user.uid].join(':');
    if (this.activeRequests.has(activeKey))
      throw new HttpException(
        'An Analytics Copilot request is already active',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    this.activeRequests.add(activeKey);
    const startedAt = Date.now();
    let usageId: string | null = null;
    let ownsReservation = false;
    try {
      const ranges = this.rangeService.resolve(dto);
      const question =
        dto.question?.trim() || this.defaultQuestion(dto.intent, dto.locale);
      const questionHash = await this.sha256(question);
      const reservation = await this.usageRepository.reserve({
        scope,
        actorId: user.uid,
        actorRole: String(user.role),
        requestId: dto.requestId,
        intent: dto.intent,
        range: ranges.current,
        comparison: ranges.comparison,
        timezone: dto.timezone,
        locale: dto.locale,
        questionHash,
        promptVersion: ANALYTICS_PROMPT_VERSION,
        expiresAt: new Date(Date.now() + config.retentionDays * 86_400_000),
      });
      usageId = reservation.record.id;
      ownsReservation = reservation.created;
      if (!reservation.created) {
        this.assertReplayMatches(reservation.record, {
          scope,
          actorId: user.uid,
          dto,
          ranges,
          questionHash,
        });
        return this.replay(
          reservation.record.status,
          reservation.record.response,
        );
      }

      const daily = await this.usageRepository.getDailyUsage(
        scope,
        this.startOfUtcDay(),
      );
      const tokensUsed =
        Number(daily._sum.inputTokens ?? 0) +
        Number(daily._sum.outputTokens ?? 0);
      const dailyBudgetExceeded =
        daily._count.id > config.dailyRestaurantRequestLimit ||
        tokensUsed >= config.dailyRestaurantTokenLimit ||
        Number(daily._sum.estimatedCostMicro ?? 0) >=
          config.dailyRestaurantCostMicroUsdLimit;

      const current = await this.repository.getSnapshot(
        scope,
        ranges.current,
        dto.timezone,
      );
      const comparison = ranges.comparison
        ? await this.repository.getSnapshot(
            scope,
            ranges.comparison,
            dto.timezone,
          )
        : null;
      const currency =
        (await this.globalSettingsService.getDefaultCurrencyCode()) ?? 'EUR';
      const providerSnapshot = this.buildProviderSnapshot(
        dto.intent,
        scope,
        ranges.current,
        dto.timezone,
        currency,
        current,
        comparison,
        dto.locale,
      );
      const snapshotHash = await this.sha256(JSON.stringify(providerSnapshot));
      const fallbackBase = this.buildResponse(
        dto,
        ranges.current,
        ranges.comparison,
        currency,
        current,
        providerSnapshot,
        this.buildFallbackExplanation(dto.locale, providerSnapshot),
        'DETERMINISTIC_FALLBACK',
      );
      if (dailyBudgetExceeded)
        return await this.persistFallback(
          usageId,
          fallbackBase,
          snapshotHash,
          'DAILY_BUDGET_EXCEEDED',
          startedAt,
        );
      if (!this.provider.isConfigured())
        return await this.persistFallback(
          usageId,
          fallbackBase,
          snapshotHash,
          'AI_KEY_MISSING',
          startedAt,
        );
      if (this.providerActive >= config.maxProviderConcurrency)
        return await this.persistFallback(
          usageId,
          fallbackBase,
          snapshotHash,
          'PROVIDER_CONCURRENCY_LIMIT',
          startedAt,
        );
      const potentialCost = Math.ceil(
        (config.maxInputTokens * config.inputCostMicroUsdPerMillionTokens +
          config.maxOutputTokens * config.outputCostMicroUsdPerMillionTokens) /
          1_000_000,
      );
      if (potentialCost > config.maxCostMicroUsdPerRequest)
        return await this.persistFallback(
          usageId,
          fallbackBase,
          snapshotHash,
          'REQUEST_COST_LIMIT',
          startedAt,
        );

      this.providerActive += 1;
      try {
        const generated = await this.provider.generate({
          requestId: dto.requestId,
          promptVersion: ANALYTICS_PROMPT_VERSION,
          locale: dto.locale,
          question,
          snapshot: providerSnapshot,
          maxInputTokens: config.maxInputTokens,
          maxOutputTokens: config.maxOutputTokens,
          timeoutMs: config.timeoutMs,
        });
        const explanation = validateAnalyticsExplanation(
          generated.output,
          new Set(providerSnapshot.metrics.map((metric) => metric.id)),
        );
        if (
          !explanation ||
          generated.estimatedCostMicroUsd > config.maxCostMicroUsdPerRequest
        ) {
          const reason = explanation
            ? 'REQUEST_COST_LIMIT'
            : 'MALFORMED_PROVIDER_OUTPUT';
          const response = { ...fallbackBase, fallbackReason: reason };
          await this.usageRepository.complete(usageId, {
            status: AiAnalyticsUsageStatus.FALLBACK,
            response,
            snapshotHash,
            fallbackReason: reason,
            provider: generated.provider,
            model: generated.model,
            inputTokens: generated.inputTokens,
            outputTokens: generated.outputTokens,
            estimatedCostMicro: generated.estimatedCostMicroUsd,
            latencyMs: Date.now() - startedAt,
          });
          return {
            data: response,
            message: 'Analytics Copilot deterministic summary generated',
          };
        }
        const response = this.buildResponse(
          dto,
          ranges.current,
          ranges.comparison,
          currency,
          current,
          providerSnapshot,
          explanation,
          'AI',
        );
        await this.usageRepository.complete(usageId, {
          status: AiAnalyticsUsageStatus.COMPLETED,
          response,
          snapshotHash,
          provider: generated.provider,
          model: generated.model,
          inputTokens: generated.inputTokens,
          outputTokens: generated.outputTokens,
          estimatedCostMicro: generated.estimatedCostMicroUsd,
          latencyMs: Date.now() - startedAt,
        });
        this.logger.log({
          event: 'analytics_copilot_completed',
          requestId: dto.requestId,
          tenantId: scope.tenantId,
          restaurantId: scope.restaurantId,
          latencyMs: Date.now() - startedAt,
          mode: response.mode,
        });
        return {
          data: response,
          message: 'Analytics Copilot response generated successfully',
        };
      } catch (error) {
        const reason =
          error instanceof AiProviderError ? error.code : 'AI_PROVIDER_ERROR';
        this.logger.warn({
          event: 'analytics_copilot_fallback',
          requestId: dto.requestId,
          tenantId: scope.tenantId,
          restaurantId: scope.restaurantId,
          reason,
        });
        return await this.persistFallback(
          usageId,
          { ...fallbackBase, fallbackReason: reason },
          snapshotHash,
          reason,
          startedAt,
        );
      } finally {
        this.providerActive -= 1;
      }
    } catch (error) {
      if (usageId && ownsReservation)
        await this.usageRepository
          .fail(usageId, this.errorCode(error), Date.now() - startedAt)
          .catch(() => undefined);
      throw error;
    } finally {
      this.activeRequests.delete(activeKey);
    }
  }

  private async resolveScope(
    user: AuthUserContext,
    restaurantId: string,
    branchId?: string,
  ): Promise<AnalyticsScope> {
    if (
      user.actorType === 'STAFF' ||
      user.role !== UserRoleEnum.BUSINESS_ADMIN ||
      !user.tid
    )
      throw new ForbiddenException(
        'Analytics Copilot is limited to restaurant owners and administrators',
      );
    if (user.rid && user.rid !== restaurantId)
      throw new ForbiddenException(
        'You cannot access analytics outside your restaurant',
      );
    const restaurant = await this.repository.findRestaurantScope(
      restaurantId,
      user.tid,
    );
    if (!restaurant)
      throw new ForbiddenException(
        'You cannot access analytics outside your tenant',
      );
    if (
      branchId &&
      !(await this.repository.findBranchScope(branchId, user.tid, restaurantId))
    )
      throw new ForbiddenException(
        'You cannot access analytics outside your restaurant branches',
      );
    return {
      tenantId: user.tid,
      restaurantId,
      branchId: branchId ?? null,
      ownerUserId: user.uid,
    };
  }

  private config() {
    return this.configService.getOrThrow<AnalyticsConfig>(
      'ai.analyticsCopilot',
    );
  }
  private startOfUtcDay() {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }
  private errorCode(error: unknown) {
    return error instanceof AiProviderError
      ? error.code
      : error instanceof Error
        ? error.name.slice(0, 80)
        : 'UNKNOWN_ERROR';
  }
  private replay(status: AiAnalyticsUsageStatus, response: unknown) {
    if (
      (status === AiAnalyticsUsageStatus.COMPLETED ||
        status === AiAnalyticsUsageStatus.FALLBACK) &&
      this.isStoredResponse(response)
    )
      return { data: response, message: 'Analytics Copilot request replayed' };
    throw new ConflictException(
      'This requestId is already in progress or failed',
    );
  }
  private isStoredResponse(value: unknown): value is AnalyticsCopilotResponse {
    return (
      typeof value === 'object' &&
      value !== null &&
      'requestId' in value &&
      'answer' in value &&
      'evidence' in value
    );
  }

  private assertReplayMatches(
    record: {
      actorId: string;
      branchId: string | null;
      intent: string;
      periodFrom: Date;
      periodToExclusive: Date;
      comparisonFrom: Date | null;
      comparisonTo: Date | null;
      timezone: string;
      locale: string;
      questionHash: string;
      promptVersion: string;
    },
    input: {
      scope: AnalyticsScope;
      actorId: string;
      dto: AnalyticsCopilotQueryDto;
      ranges: {
        current: AnalyticsDateRange;
        comparison: AnalyticsDateRange | null;
      };
      questionHash: string;
    },
  ) {
    const sameDate = (left: Date | null, right: Date | null) =>
      left?.getTime() === right?.getTime();
    if (
      record.actorId !== input.actorId ||
      record.branchId !== input.scope.branchId ||
      record.intent !== String(input.dto.intent) ||
      !sameDate(record.periodFrom, input.ranges.current.startUtc) ||
      !sameDate(
        record.periodToExclusive,
        input.ranges.current.endExclusiveUtc,
      ) ||
      !sameDate(
        record.comparisonFrom,
        input.ranges.comparison?.startUtc ?? null,
      ) ||
      !sameDate(
        record.comparisonTo,
        input.ranges.comparison?.endExclusiveUtc ?? null,
      ) ||
      record.timezone !== input.dto.timezone ||
      record.locale !== input.dto.locale ||
      record.questionHash !== input.questionHash ||
      record.promptVersion !== ANALYTICS_PROMPT_VERSION
    )
      throw new ConflictException(
        'This requestId was already used with different analytics input',
      );
  }

  private buildProviderSnapshot(
    intent: AnalyticsIntent,
    scope: AnalyticsScope,
    range: AnalyticsDateRange,
    timezone: string,
    currency: string,
    current: AnalyticsPeriodSnapshot,
    comparison: AnalyticsPeriodSnapshot | null,
    locale: 'en' | 'de',
  ): AnalyticsProviderSnapshot {
    return {
      schemaVersion: 'analytics-copilot-v1',
      intent,
      timezone,
      currency,
      period: { fromDate: range.fromDate, toDate: range.toDate },
      metrics: this.buildMetrics(current, comparison),
      paymentTypes: current.paymentTypes,
      popularItems: current.popularItems,
      busyHours: current.busyHours,
      staffPerformance: current.staffPerformance.map(
        ({ staffRef, activityCount }) => ({ staffRef, activityCount }),
      ),
      definitions: this.definitions(locale),
    };
  }

  private buildMetrics(
    current: AnalyticsPeriodSnapshot,
    comparison: AnalyticsPeriodSnapshot | null,
  ): AnalyticsMetric[] {
    const busiest = [...current.busyHours].sort(
      (a, b) => b.orderCount - a.orderCount || a.hour - b.hour,
    )[0];
    return [
      this.metric(
        'revenue',
        'Revenue',
        current.sales.revenue,
        'currency',
        comparison?.sales.revenue,
      ),
      this.metric(
        'successful_orders',
        'Successful orders',
        current.sales.successfulOrders,
        'count',
        comparison?.sales.successfulOrders,
      ),
      this.metric(
        'average_order_value',
        'Average order value',
        current.sales.averageOrderValue,
        'currency',
        comparison?.sales.averageOrderValue,
      ),
      this.metric(
        'cancelled_orders',
        'Cancelled orders',
        current.cancellations.cancelledOrders,
        'count',
        comparison?.cancellations.cancelledOrders,
      ),
      this.metric(
        'cancellation_rate',
        'Cancellation rate',
        current.cancellations.rate,
        'percent',
        comparison?.cancellations.rate,
      ),
      this.metric('busiest_hour', 'Busiest hour', busiest?.hour ?? 0, 'hour'),
      this.metric(
        'busiest_hour_orders',
        'Busiest-hour orders',
        busiest?.orderCount ?? 0,
        'count',
      ),
      this.metric(
        'top_item_quantity',
        'Top item quantity',
        current.popularItems[0]?.quantity ?? 0,
        'count',
      ),
      this.metric(
        'top_staff_activity',
        'Top staff activity count',
        current.staffPerformance[0]?.activityCount ?? 0,
        'count',
      ),
    ];
  }

  private metric(
    id: string,
    label: string,
    value: number,
    unit: AnalyticsMetric['unit'],
    comparisonValue?: number,
  ): AnalyticsMetric {
    const changePercent =
      comparisonValue === undefined || comparisonValue === 0
        ? null
        : Number(
            (
              ((value - comparisonValue) / Math.abs(comparisonValue)) *
              100
            ).toFixed(2),
          );
    return {
      id,
      label,
      value: Number(value.toFixed(2)),
      unit,
      ...(comparisonValue === undefined
        ? {}
        : {
            comparisonValue: Number(comparisonValue.toFixed(2)),
            changePercent,
          }),
    };
  }

  private buildResponse(
    dto: AnalyticsCopilotQueryDto,
    range: AnalyticsDateRange,
    comparison: AnalyticsDateRange | null,
    currency: string,
    current: AnalyticsPeriodSnapshot,
    snapshot: AnalyticsProviderSnapshot,
    answer: AnalyticsExplanation,
    mode: AnalyticsCopilotResponse['mode'],
  ): AnalyticsCopilotResponse {
    return {
      requestId: dto.requestId,
      mode,
      intent: dto.intent,
      generatedAt: new Date().toISOString(),
      period: {
        fromDate: range.fromDate,
        toDate: range.toDate,
        timezone: dto.timezone,
      },
      comparison: comparison
        ? { fromDate: comparison.fromDate, toDate: comparison.toDate }
        : null,
      currency,
      answer,
      evidence: {
        metrics: snapshot.metrics,
        paymentTypes: current.paymentTypes,
        popularItems: current.popularItems,
        busyHours: current.busyHours,
        staffPerformance: current.staffPerformance,
        definitions: snapshot.definitions,
      },
    };
  }

  private buildFallbackExplanation(
    locale: 'en' | 'de',
    snapshot: AnalyticsProviderSnapshot,
  ): AnalyticsExplanation {
    const revenue =
      snapshot.metrics.find((metric) => metric.id === 'revenue')?.value ?? 0;
    const orders =
      snapshot.metrics.find((metric) => metric.id === 'successful_orders')
        ?.value ?? 0;
    const cancellations =
      snapshot.metrics.find((metric) => metric.id === 'cancelled_orders')
        ?.value ?? 0;
    if (locale === 'de')
      return {
        summary:
          'Im ausgewählten Zeitraum wurden ' +
          orders +
          ' erfolgreiche Bestellungen und ' +
          revenue.toFixed(2) +
          ' ' +
          snapshot.currency +
          ' Umsatz erfasst.',
        insights: [
          {
            title: 'Bestellungen und Umsatz',
            detail:
              orders +
              ' erfolgreiche Bestellungen; Umsatz ' +
              revenue.toFixed(2) +
              ' ' +
              snapshot.currency +
              '.',
            evidenceMetricIds: ['successful_orders', 'revenue'],
          },
          {
            title: 'Stornierungen',
            detail: cancellations + ' Bestellungen wurden storniert.',
            evidenceMetricIds: ['cancelled_orders', 'cancellation_rate'],
          },
        ],
        caveats: [
          'Dies ist eine deterministische, schreibgeschützte Zusammenfassung.',
        ],
        followUpQuestions: [
          'Wann waren die stärksten Bestellzeiten?',
          'Welche Artikel waren am beliebtesten?',
        ],
      };
    return {
      summary:
        'The selected period recorded ' +
        orders +
        ' successful orders and ' +
        revenue.toFixed(2) +
        ' ' +
        snapshot.currency +
        ' in revenue.',
      insights: [
        {
          title: 'Orders and revenue',
          detail:
            orders +
            ' successful orders generated ' +
            revenue.toFixed(2) +
            ' ' +
            snapshot.currency +
            '.',
          evidenceMetricIds: ['successful_orders', 'revenue'],
        },
        {
          title: 'Cancellations',
          detail: cancellations + ' orders were cancelled.',
          evidenceMetricIds: ['cancelled_orders', 'cancellation_rate'],
        },
      ],
      caveats: ['This is a deterministic, read-only summary.'],
      followUpQuestions: [
        'When were the busiest order hours?',
        'Which items were most popular?',
      ],
    };
  }

  private defaultQuestion(intent: AnalyticsIntent, locale: 'en' | 'de') {
    return locale === 'de'
      ? 'Erkläre die Kennzahlen für ' + intent + '.'
      : 'Explain the ' + intent + ' metrics.';
  }

  private async persistFallback(
    id: string,
    response: AnalyticsCopilotResponse,
    snapshotHash: string,
    reason: string,
    startedAt: number,
  ) {
    const finalResponse = { ...response, fallbackReason: reason };
    await this.usageRepository.complete(id, {
      status: AiAnalyticsUsageStatus.FALLBACK,
      response: finalResponse,
      snapshotHash,
      fallbackReason: reason,
      latencyMs: Date.now() - startedAt,
    });
    return {
      data: finalResponse,
      message: 'Analytics Copilot deterministic summary generated',
    };
  }

  private definitions(locale: 'en' | 'de') {
    if (locale === 'de')
      return [
        'Umsatz und durchschnittlicher Bestellwert enthalten nur die kanonischen erfolgreichen Status von CONFIRMED bis DELIVERED.',
        'Die Stornierungsrate teilt stornierte Bestellungen durch platzierte, erfolgreiche, stornierte und abgelehnte Bestellungen; PAYMENT_PENDING ist ausgeschlossen.',
        'Stoßzeiten verwenden die Erstellungszeit der Bestellung in der angeforderten IANA-Zeitzone.',
        'Mitarbeiterleistung ist eine Aktivitätsnäherung aus dem Aktivitätsprotokoll und keine Qualitäts- oder Produktivitätsbewertung.',
      ];
    return [
      'Revenue and average order value include canonical successful statuses only: CONFIRMED through DELIVERED.',
      'Cancellation rate is cancelled orders divided by placed, successful, cancelled, and rejected orders; PAYMENT_PENDING is excluded.',
      'Busy hours use order created time converted to the requested IANA timezone.',
      'Staff performance is an activity-count proxy from staff activity logs, not a quality or productivity score.',
    ];
  }

  private async sha256(value: string) {
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(value),
    );
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
}
