import { Injectable } from '@nestjs/common';
import { cpus, freemem, loadavg, totalmem, uptime } from 'node:os';
import { statfsSync } from 'node:fs';
import {
  SystemHealthIntegrationLogsQueryDto,
  SystemHealthLogsQueryDto,
  SystemHealthMetricsQueryDto,
} from './dto';
import { SystemHealthMetricsService } from './system-health-metrics.service';
import { SystemHealthRepository } from './system-health.repository';

type HealthStatus = 'healthy' | 'degraded' | 'down';

@Injectable()
export class SystemHealthService {
  constructor(
    private readonly systemHealthRepository: SystemHealthRepository,
    private readonly systemHealthMetricsService: SystemHealthMetricsService,
  ) {}

  async getOverview() {
    const [database, platform] = await Promise.all([
      this.systemHealthRepository.pingDatabase(),
      this.systemHealthRepository.getPlatformSummary(),
    ]);

    const server = this.readServerStats();
    const status = this.resolveOverallStatus(server, database.status);

    return {
      data: {
        status,
        checkedAt: new Date().toISOString(),
        server,
        database,
        platform,
        api: this.systemHealthMetricsService.getRequestOverview('hour'),
        integrations: this.systemHealthMetricsService.getIntegrationOverview(),
      },
      message: 'System health fetched successfully',
    };
  }

  getRequestMetrics(query: SystemHealthMetricsQueryDto) {
    return {
      data: this.systemHealthMetricsService.getRequestMetrics(query.range),
      message: 'System health request metrics fetched successfully',
    };
  }

  getRequestLogs(query: SystemHealthLogsQueryDto) {
    return {
      data: this.systemHealthMetricsService.getRecentRequestLogs(query.limit),
      message: 'System health request logs fetched successfully',
    };
  }

  getIntegrationLogs(query: SystemHealthIntegrationLogsQueryDto) {
    const result = this.systemHealthMetricsService.getIntegrationLogs(
      query.type,
      query.limit,
    );

    return {
      data: result,
      message: 'System health integration logs fetched successfully',
    };
  }

  private readServerStats() {
    const totalMemoryBytes = totalmem();
    const freeMemoryBytes = freemem();
    const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes;
    const memoryUsedPercent = this.toPercent(usedMemoryBytes, totalMemoryBytes);

    const cpuCores = cpus().length || 1;
    const load1m = loadavg()[0] ?? 0;
    const cpuEstimatedUsagePercent = Math.min(
      100,
      Number(((load1m / cpuCores) * 100).toFixed(2)),
    );

    const disk = this.readDiskStats();

    return {
      uptimeSeconds: Math.floor(uptime()),
      cpu: {
        cores: cpuCores,
        load1m: Number(load1m.toFixed(2)),
        estimatedUsagePercent: cpuEstimatedUsagePercent,
      },
      memory: {
        totalBytes: totalMemoryBytes,
        freeBytes: freeMemoryBytes,
        usedBytes: usedMemoryBytes,
        usedPercent: memoryUsedPercent,
      },
      disk,
    };
  }

  private readDiskStats() {
    const stats = statfsSync('/', { bigint: true });
    const totalBytes = Number(stats.blocks * stats.bsize);
    const freeBytes = Number(stats.bavail * stats.bsize);
    const usedBytes = totalBytes - freeBytes;

    return {
      path: '/',
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent: this.toPercent(usedBytes, totalBytes),
    };
  }

  private resolveOverallStatus(
    server: {
      cpu: { estimatedUsagePercent: number };
      memory: { usedPercent: number };
      disk: { usedPercent: number };
    },
    databaseStatus: 'up' | 'down',
  ): HealthStatus {
    if (databaseStatus === 'down') {
      return 'down';
    }

    const isDegraded =
      server.cpu.estimatedUsagePercent >= 90 ||
      server.memory.usedPercent >= 90 ||
      server.disk.usedPercent >= 90;

    return isDegraded ? 'degraded' : 'healthy';
  }

  private toPercent(value: number, total: number) {
    if (!total) {
      return 0;
    }

    return Number(((value / total) * 100).toFixed(2));
  }
}
