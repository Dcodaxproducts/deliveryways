import { Injectable } from '@nestjs/common';
import { SystemHealthIntegrationType, SystemHealthRange } from './dto';

type RequestMetricRecord = {
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  success: boolean;
};

type IntegrationLogRecord = {
  id: string;
  type: SystemHealthIntegrationType;
  status: 'success' | 'failed' | 'warning';
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
};

@Injectable()
export class SystemHealthMetricsService {
  private readonly requestMetrics: RequestMetricRecord[] = [];
  private readonly integrationLogs: Record<
    SystemHealthIntegrationType,
    IntegrationLogRecord[]
  > = {
    webhook: [],
    printer: [],
  };

  private readonly maxRequestMetrics = 5000;
  private readonly maxIntegrationLogs = 500;

  recordRequest(
    input: Omit<RequestMetricRecord, 'timestamp'> & { timestamp?: string },
  ) {
    this.requestMetrics.push({
      ...input,
      timestamp: input.timestamp ?? new Date().toISOString(),
      durationMs: Number(input.durationMs.toFixed(2)),
    });

    this.trimArray(this.requestMetrics, this.maxRequestMetrics);
  }

  recordIntegrationLog(
    type: SystemHealthIntegrationType,
    input: Omit<IntegrationLogRecord, 'id' | 'type' | 'timestamp'> & {
      timestamp?: string;
    },
  ) {
    this.integrationLogs[type].push({
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      status: input.status,
      message: input.message,
      meta: input.meta,
      timestamp: input.timestamp ?? new Date().toISOString(),
    });

    this.trimArray(this.integrationLogs[type], this.maxIntegrationLogs);
  }

  getRequestOverview(range: SystemHealthRange = 'hour') {
    const records = this.getRecordsForRange(range);

    return {
      range,
      ...this.buildSummary(records),
    };
  }

  getRequestMetrics(range: SystemHealthRange = 'hour') {
    const records = this.getRecordsForRange(range);
    const buckets = this.buildBuckets(range, records);

    return {
      range,
      summary: this.buildSummary(records),
      buckets,
    };
  }

  getRecentRequestLogs(limit = 20) {
    return this.requestMetrics.slice(-limit).reverse();
  }

  getIntegrationOverview() {
    return {
      webhook: this.buildIntegrationTypeSummary('webhook'),
      printer: this.buildIntegrationTypeSummary('printer'),
    };
  }

  getIntegrationLogs(
    type: SystemHealthIntegrationType = 'webhook',
    limit = 20,
  ) {
    return {
      type,
      items: this.integrationLogs[type].slice(-limit).reverse(),
    };
  }

  private buildIntegrationTypeSummary(type: SystemHealthIntegrationType) {
    const items = this.integrationLogs[type];
    const latest = items[items.length - 1] ?? null;
    const failedCount = items.filter((item) => item.status === 'failed').length;

    return {
      status: latest ? latest.status : 'tracking_pending',
      totalEvents: items.length,
      failedCount,
      latest,
    };
  }

  private getRecordsForRange(range: SystemHealthRange) {
    const now = Date.now();
    const start =
      range === 'week'
        ? now - 7 * 24 * 60 * 60 * 1000
        : range === 'day'
          ? now - 24 * 60 * 60 * 1000
          : now - 60 * 60 * 1000;

    return this.requestMetrics.filter(
      (record) => new Date(record.timestamp).getTime() >= start,
    );
  }

  private buildSummary(records: RequestMetricRecord[]) {
    const totalRequests = records.length;
    const successCount = records.filter((record) => record.success).length;
    const failureCount = totalRequests - successCount;
    const averageLatencyMs = totalRequests
      ? Number(
          (
            records.reduce((sum, record) => sum + record.durationMs, 0) /
            totalRequests
          ).toFixed(2),
        )
      : 0;
    const sortedDurations = [...records]
      .map((record) => record.durationMs)
      .sort((left, right) => left - right);
    const p95LatencyMs =
      sortedDurations.length > 0
        ? (sortedDurations[
            Math.min(
              sortedDurations.length - 1,
              Math.floor(sortedDurations.length * 0.95),
            )
          ] ?? 0)
        : 0;

    return {
      totalRequests,
      successCount,
      failureCount,
      successRate: this.toPercent(successCount, totalRequests),
      failureRate: this.toPercent(failureCount, totalRequests),
      averageLatencyMs,
      p95LatencyMs: Number(p95LatencyMs.toFixed(2)),
    };
  }

  private buildBuckets(
    range: SystemHealthRange,
    records: RequestMetricRecord[],
  ) {
    const now = Date.now();
    const bucketSizeMs =
      range === 'week'
        ? 24 * 60 * 60 * 1000
        : range === 'day'
          ? 60 * 60 * 1000
          : 5 * 60 * 1000;
    const bucketCount = range === 'week' ? 7 : range === 'day' ? 24 : 12;
    const firstBucketStart = now - bucketSizeMs * bucketCount;

    return Array.from({ length: bucketCount }, (_, index) => {
      const start = firstBucketStart + index * bucketSizeMs;
      const end = start + bucketSizeMs;
      const bucketRecords = records.filter((record) => {
        const timestamp = new Date(record.timestamp).getTime();
        return timestamp >= start && timestamp < end;
      });
      const summary = this.buildSummary(bucketRecords);

      return {
        label: new Date(start).toISOString(),
        startedAt: new Date(start).toISOString(),
        endedAt: new Date(end).toISOString(),
        ...summary,
      };
    });
  }

  private toPercent(value: number, total: number) {
    if (!total) {
      return 0;
    }

    return Number(((value / total) * 100).toFixed(2));
  }

  private trimArray<T>(items: T[], maxSize: number) {
    if (items.length <= maxSize) {
      return;
    }

    items.splice(0, items.length - maxSize);
  }
}
