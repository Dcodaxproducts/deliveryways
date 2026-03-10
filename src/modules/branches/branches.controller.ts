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
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { AuthUserContext } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import { BranchesService } from './branches.service';
import {
  CreateBranchDto,
  ListBranchesDto,
  ListPublicBranchesDto,
  UpdateBranchDto,
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
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
  )
  @ApiQuery({
    name: 'restaurantId',
    required: false,
    example: 'clx...',
    description: 'Optional for business/branch admin; token restaurant scope is used',
  })
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

  @Public()
  @Get('public')
  listPublic(@Query() query: ListPublicBranchesDto) {
    return this.branchesService.listPublic(query);
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
