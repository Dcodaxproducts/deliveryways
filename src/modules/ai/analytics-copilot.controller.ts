import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUserContext, CurrentUser, Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard as TenantGuard,
} from '../../common/guards';
import { AnalyticsCopilotService } from './analytics-copilot.service';
import {
  AnalyticsCapabilitiesQueryDto,
  AnalyticsCopilotQueryDto,
} from './dto/analytics-copilot.dto';

@ApiTags('AI Analytics Copilot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Controller('ai/analytics')
export class AnalyticsCopilotController {
  constructor(private readonly service: AnalyticsCopilotService) {}

  @Get('capabilities')
  @Roles(RolesEnum.BUSINESS_ADMIN)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Get read-only Analytics Copilot capability state' })
  getCapabilities(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AnalyticsCapabilitiesQueryDto,
  ) {
    return this.service.getCapabilities(user, query);
  }

  @Post('query')
  @HttpCode(200)
  @Roles(RolesEnum.BUSINESS_ADMIN)
  @Throttle({ default: { ttl: 60 * 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Generate a bounded read-only restaurant analytics explanation',
  })
  query(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: AnalyticsCopilotQueryDto,
  ) {
    return this.service.query(user, dto);
  }
}
