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
  UpdateWinOrderConnectionDto,
} from './dto';
import { WinOrderConnectionService } from './winorder-connection.service';

@ApiTags('WinOrder Integration')
@ApiBearerAuth()
@Controller('admin/integrations/winorder')
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN, RolesEnum.BRANCH_ADMIN)
export class WinOrderAdminController {
  constructor(private readonly connectionService: WinOrderConnectionService) {}

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
}
