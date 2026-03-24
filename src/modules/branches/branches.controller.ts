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
import { ApiBearerAuth, ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../common/decorators';
import { AuthUserContext } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import { BranchesService } from './branches.service';
import {
  BulkCreateBranchesDto,
  CreateBranchDto,
  ListBranchesDto,
  UpdateBranchDto,
  UpdateBranchImagesDto,
} from './dto';

@ApiTags('Branches')
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @ApiBody({
    schema: {
      example: {
        restaurantId: 'clx_restaurant_id',
        name: 'Main Branch',
        street: 'Street 12',
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
        isMain: false,
        area: 'DHA Phase 5',
        branchAdmin: {
          email: 'branch.admin@example.com',
          password: 'Admin@12345',
          firstName: 'Branch',
          lastName: 'Admin',
          phone: '+923001234567',
        },
      },
    },
  })
  @Post()
  create(@CurrentUser() user: AuthUserContext, @Body() dto: CreateBranchDto) {
    return this.branchesService.createFromUser(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Post('bulk')
  createBulk(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: BulkCreateBranchesDto,
  ) {
    return this.branchesService.createBulkFromUser(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @ApiQuery({
    name: 'restaurantId',
    required: false,
    example: 'clx...',
    description:
      'Super admin may fetch all or filter by restaurant. Business/branch/customer use token restaurant scope.',
  })
  @ApiQuery({ name: 'lat', required: false, example: 31.5204 })
  @ApiQuery({ name: 'lng', required: false, example: 74.3587 })
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
  list(@CurrentUser() user: AuthUserContext, @Query() query: ListBranchesDto) {
    return this.branchesService.list(user, query);
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
  @Patch(':id/images')
  updateImages(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateBranchImagesDto,
  ) {
    return this.branchesService.updateImages(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.branchesService.remove(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Delete(':id/force')
  forceDelete(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.branchesService.forceDelete(user, id);
  }
}
