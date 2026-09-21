import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserContext, CurrentUser, Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import { ListStaffActivityLogsDto } from './dto';
import { StaffActivityLogsService } from './staff-activity-logs.service';

@ApiTags('Staff Activity Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(RolesEnum.SUPER_ADMIN)
@Controller('staff-activity-logs')
export class StaffActivityLogsController {
  constructor(private readonly service: StaffActivityLogsService) {}

  @Get()
  @ApiOperation({ summary: 'List activity from Superadmin-created staff' })
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListStaffActivityLogsDto,
  ) {
    return this.service.list(user, query);
  }
}
