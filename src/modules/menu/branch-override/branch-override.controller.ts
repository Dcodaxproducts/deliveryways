import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../../common/decorators';
import { AuthUserContext } from '../../../common/decorators';
import { RolesEnum } from '../../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../../common/guards';
import {
  UpsertBranchCategoryOverrideDto,
  UpsertBranchMenuItemOverrideDto,
} from './dto';
import { BranchOverrideService } from './branch-override.service';

@ApiTags('Branch Overrides')
@Controller('menu/branch-overrides')
export class BranchOverrideController {
  constructor(private readonly branchOverrideService: BranchOverrideService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Post('items')
  upsertItemOverride(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpsertBranchMenuItemOverrideDto,
  ) {
    return this.branchOverrideService.upsertItemOverride(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Post('categories')
  upsertCategoryOverride(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpsertBranchCategoryOverrideDto,
  ) {
    return this.branchOverrideService.upsertCategoryOverride(user, dto);
  }
}
