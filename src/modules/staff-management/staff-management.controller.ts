import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUserContext, CurrentUser, Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import {
  CreateStaffDto,
  ListStaffDto,
  UpdateStaffDto,
  UpdateStaffStatusDto,
} from './dto';
import { StaffManagementService } from './staff-management.service';

@ApiTags('Staff Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN, RolesEnum.BRANCH_ADMIN)
@Controller('staff-management')
export class StaffManagementController {
  constructor(
    private readonly staffManagementService: StaffManagementService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthUserContext, @Body() dto: CreateStaffDto) {
    return this.staffManagementService.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUserContext, @Query() query: ListStaffDto) {
    return this.staffManagementService.list(user, query);
  }

  @Get(':id')
  details(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.staffManagementService.details(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffManagementService.update(user, id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateStaffStatusDto,
  ) {
    return this.staffManagementService.updateStatus(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.staffManagementService.remove(user, id);
  }
}
