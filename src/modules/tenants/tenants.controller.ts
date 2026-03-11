import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
  Body,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminListQueryDto } from '../../common/dto';
import { CurrentUser } from '../../common/decorators';
import { AuthUserContext } from '../../common/decorators';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
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
