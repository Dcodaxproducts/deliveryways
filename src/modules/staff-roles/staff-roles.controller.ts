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
  CreateStaffRoleDto,
  ListStaffRolesDto,
  UpdateStaffRoleDto,
} from './dto';
import { StaffRolesService } from './staff-roles.service';

@ApiTags('Staff Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN, RolesEnum.BRANCH_ADMIN)
@Controller('staff-roles')
export class StaffRolesController {
  constructor(private readonly staffRolesService: StaffRolesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateStaffRoleDto,
  ) {
    return this.staffRolesService.create(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListStaffRolesDto,
  ) {
    return this.staffRolesService.list(user, query);
  }

  @Get(':id')
  details(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.staffRolesService.details(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateStaffRoleDto,
  ) {
    return this.staffRolesService.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.staffRolesService.remove(user, id);
  }
}
