import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QueryDto } from '../../common/dto';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { AuthUserContext } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import { JwtAuthGuard, RolesGuard, TenantAccessGuard } from '../../common/guards';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto';

@ApiTags('Branches')
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUserContext, @Body() dto: CreateBranchDto) {
    return this.branchesService.create(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.BRANCH_ADMIN, RolesEnum.SUPER_ADMIN)
  @Get()
  list(
    @CurrentUser() user: AuthUserContext,
    @Query('restaurantId') restaurantId: string,
    @Query() query: QueryDto,
  ) {
    return this.branchesService.list(user, restaurantId, query);
  }

  @Public()
  @Get('public')
  listPublic(
    @Query('tenantId') tenantId: string,
    @Query('restaurantId') restaurantId: string,
    @Query() query: QueryDto,
  ) {
    return this.branchesService.listPublic(tenantId, restaurantId, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branchesService.update(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.branchesService.remove(user, id);
  }
}
