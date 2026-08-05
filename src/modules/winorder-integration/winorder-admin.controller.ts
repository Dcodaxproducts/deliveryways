import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
  CreateWinOrderConnectionDto,
  ReplaceWinOrderCatalogMappingsDto,
  ReplaceWinOrderPaymentMappingsDto,
  UpdateWinOrderConnectionDto,
} from './dto';
import { WinOrderConnectionService } from './winorder-connection.service';
import { WinOrderMappingService } from './winorder-mapping.service';
import { WinOrderHealthService } from './winorder-health.service';

@ApiTags('WinOrder Integration')
@ApiBearerAuth()
@Controller('admin/integrations/winorder')
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN, RolesEnum.BRANCH_ADMIN)
export class WinOrderAdminController {
  constructor(
    private readonly connectionService: WinOrderConnectionService,
    private readonly mappingService: WinOrderMappingService,
    private readonly healthService: WinOrderHealthService,
  ) {}

  @Get('connections/:branchId')
  get(
    @CurrentUser() user: AuthUserContext,
    @Param('branchId') branchId: string,
  ) {
    return this.connectionService.get(user, branchId);
  }

  @Post('connections')
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  create(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateWinOrderConnectionDto,
  ) {
    return this.connectionService.create(user, dto);
  }

  @Patch('connections/:branchId')
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('branchId') branchId: string,
    @Body() dto: UpdateWinOrderConnectionDto,
  ) {
    return this.connectionService.update(user, branchId, dto);
  }

  @Post('connections/:branchId/rotate')
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  rotate(
    @CurrentUser() user: AuthUserContext,
    @Param('branchId') branchId: string,
  ) {
    return this.connectionService.rotate(user, branchId);
  }

  @Get('mappings/:branchId')
  getMappings(
    @CurrentUser() user: AuthUserContext,
    @Param('branchId') branchId: string,
  ) {
    return this.mappingService.get(user, branchId);
  }

  @Patch('mappings/:branchId/catalog')
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  replaceCatalogMappings(
    @CurrentUser() user: AuthUserContext,
    @Param('branchId') branchId: string,
    @Body() dto: ReplaceWinOrderCatalogMappingsDto,
  ) {
    return this.mappingService.replaceCatalog(user, branchId, dto);
  }

  @Patch('mappings/:branchId/payments')
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  replacePaymentMappings(
    @CurrentUser() user: AuthUserContext,
    @Param('branchId') branchId: string,
    @Body() dto: ReplaceWinOrderPaymentMappingsDto,
  ) {
    return this.mappingService.replacePayments(user, branchId, dto);
  }

  @Get('health/:branchId')
  getHealth(
    @CurrentUser() user: AuthUserContext,
    @Param('branchId') branchId: string,
  ) {
    return this.healthService.get(user, branchId);
  }

  @Post('health/:branchId/retry-failed')
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  retryFailed(
    @CurrentUser() user: AuthUserContext,
    @Param('branchId') branchId: string,
  ) {
    return this.healthService.retryFailed(user, branchId);
  }
}
