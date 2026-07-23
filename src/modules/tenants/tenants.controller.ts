import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminListQueryDto } from '../../common/dto';
import { CurrentUser } from '../../common/decorators';
import { AuthUserContext } from '../../common/decorators';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard as TenantGuard,
} from '../../common/guards';
import { RolesEnum } from '../../common/enums';
import { Roles } from '../../common/decorators';
import { TenantsService } from './tenants.service';
import {
  ResetOwnerPasswordDto,
  UpdateBusinessOwnerDetailsDto,
  UpdateTenantDto,
} from './dto';

@ApiTags('Tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles(RolesEnum.SUPER_ADMIN)
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'search', required: false, example: 'dcodax' })
  @ApiQuery({ name: 'sortBy', required: false, example: 'createdAt' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({
    name: 'withDeleted',
    required: false,
    example: false,
    description: 'Super admin only',
  })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    example: false,
    description: 'Super admin only',
  })
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminListQueryDto,
  ) {
    return this.tenantsService.listTenants(user, query);
  }

  @Get(':id')
  @Roles(RolesEnum.SUPER_ADMIN)
  details(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.tenantsService.tenantDetails(user, id);
  }

  @Patch(':id/owner-password')
  @Roles(RolesEnum.SUPER_ADMIN)
  resetOwnerPassword(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: ResetOwnerPasswordDto,
  ) {
    return this.tenantsService.resetOwnerPassword(user, id, dto.password);
  }

  @Patch(':id/business-owner')
  @Roles(RolesEnum.SUPER_ADMIN)
  updateBusinessOwnerDetails(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateBusinessOwnerDetailsDto,
  ) {
    return this.tenantsService.updateBusinessOwnerDetails(user, id, dto);
  }

  @Patch(':id')
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.updateTenant(user, id, dto);
  }

  @Get(':id/analytics')
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  analytics(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.tenantsService.tenantAnalytics(user, id);
  }

  @Delete(':id/force')
  @Roles(RolesEnum.SUPER_ADMIN)
  forceDelete(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.tenantsService.forceDeleteTenant(user, id);
  }
}
