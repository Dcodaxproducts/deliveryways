import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminListQueryDto, QueryDto } from '../../common/dto';
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
    return this.branchesService.createFromUser(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.BRANCH_ADMIN, RolesEnum.SUPER_ADMIN)
  @ApiQuery({ name: 'restaurantId', required: true, example: 'clx...' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'search', required: false, example: 'islamabad' })
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
    description: 'Admin only',
  })
  @Get()
  list(
    @CurrentUser() user: AuthUserContext,
    @Query('restaurantId') restaurantId: string,
    @Query() query: AdminListQueryDto,
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
  @Patch(':id/suspend')
  suspend(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.branchesService.suspend(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Patch(':id/activate')
  activate(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.branchesService.activate(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.branchesService.remove(user, id);
  }
}
