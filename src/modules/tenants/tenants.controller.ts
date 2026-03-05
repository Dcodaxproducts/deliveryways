import { Controller, Get, Param, Patch, Query, UseGuards, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QueryDto } from '../../common/dto';
import { CurrentUser } from '../../common/decorators';
import { AuthUserContext } from '../../common/decorators';
import { JwtAuthGuard, RolesGuard, TenantAccessGuard } from '../../common/guards';
import { RolesEnum } from '../../common/enums';
import { Roles } from '../../common/decorators';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto';

@ApiTags('Tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles(RolesEnum.SUPER_ADMIN)
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: QueryDto,
    @Query('withDeleted') withDeleted?: string,
  ) {
    return this.tenantsService.listTenants(user, query, withDeleted === 'true');
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
}
