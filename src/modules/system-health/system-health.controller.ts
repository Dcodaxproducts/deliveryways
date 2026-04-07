import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import {
  SystemHealthIntegrationLogsQueryDto,
  SystemHealthLogsQueryDto,
  SystemHealthMetricsQueryDto,
} from './dto';
import { SystemHealthService } from './system-health.service';

@ApiTags('System Health')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(RolesEnum.SUPER_ADMIN)
@Controller('admin/system-health')
export class SystemHealthController {
  constructor(private readonly systemHealthService: SystemHealthService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get platform system health overview' })
  getOverview() {
    return this.systemHealthService.getOverview();
  }

  @Get('requests/metrics')
  @ApiOperation({ summary: 'Get request success/failure/latency metrics' })
  getRequestMetrics(@Query() query: SystemHealthMetricsQueryDto) {
    return this.systemHealthService.getRequestMetrics(query);
  }

  @Get('requests/logs')
  @ApiOperation({
    summary: 'Get recent request logs captured by runtime metrics',
  })
  getRequestLogs(@Query() query: SystemHealthLogsQueryDto) {
    return this.systemHealthService.getRequestLogs(query);
  }

  @Get('integration-logs')
  @ApiOperation({
    summary: 'Get recent integration logs for webhooks or printer events',
  })
  getIntegrationLogs(@Query() query: SystemHealthIntegrationLogsQueryDto) {
    return this.systemHealthService.getIntegrationLogs(query);
  }
}
