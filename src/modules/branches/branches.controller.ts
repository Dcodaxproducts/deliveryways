import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
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
  TenantAccessGuard as TenantGuard,
} from '../../common/guards';
import { BranchesService } from './branches.service';
import {
  BulkCreateBranchesDto,
  CleanupOrphanBranchDto,
  CreateBranchDto,
  ListBranchesDto,
  UpdateBranchDto,
  UpdateBranchDeliveryHoursDto,
  UpdateBranchDeliveryTimeDto,
  UpdateBranchHolidayOpeningHoursDto,
  UpdateBranchNotificationSettingsDto,
  UpdateBranchImagesDto,
  UpdateBranchOpeningHoursDto,
  UpdateBranchTemporaryClosureDto,
} from './dto';

@ApiTags('Branches')
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @ApiBody({
    schema: {
      example: {
        name: 'Main Branch',
        street: 'Street 12',
        shopNumber: 'Shop 4',
        postalCode: '54000',
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
        lat: '31.5204',
        lng: '74.3587',
        isMain: false,
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
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Post('bulk')
  createBulk(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: BulkCreateBranchesDto,
  ) {
    return this.branchesService.createBulkFromUser(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
    RolesEnum.CUSTOMER,
    RolesEnum.STAFF,
  )
  @ApiQuery({
    name: 'restaurantId',
    required: false,
    example: 'clx...',
    description:
      'Super admin may fetch all or filter by restaurant. Business/branch/customer use token restaurant scope.',
  })
  @ApiQuery({
    name: 'lat',
    required: false,
    example: 33.6844,
    description:
      'When passed together with lng, branches are sorted by nearest distance from this coordinate.',
  })
  @ApiQuery({
    name: 'lng',
    required: false,
    example: 73.0479,
    description:
      'When passed together with lat, branches are sorted by nearest distance from this coordinate.',
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

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
    RolesEnum.CUSTOMER,
    RolesEnum.STAFF,
  )
  @Get(':id')
  details(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.branchesService.details(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
    RolesEnum.STAFF,
    RolesEnum.CUSTOMER,
  )
  @Get(':id/opening-hours')
  openingHours(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.branchesService.getOpeningHours(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
    RolesEnum.STAFF,
  )
  @Put(':id/opening-hours')
  updateOpeningHours(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateBranchOpeningHoursDto,
  ) {
    return this.branchesService.updateOpeningHours(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
    RolesEnum.CUSTOMER,
    RolesEnum.STAFF,
  )
  @Get(':id/holiday-opening-hours')
  holidayOpeningHours(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
  ) {
    return this.branchesService.getHolidayOpeningHours(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
    RolesEnum.STAFF,
  )
  @Put(':id/holiday-opening-hours')
  updateHolidayOpeningHours(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateBranchHolidayOpeningHoursDto,
  ) {
    return this.branchesService.updateHolidayOpeningHours(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
    RolesEnum.CUSTOMER,
    RolesEnum.STAFF,
  )
  @Get(':id/delivery-time')
  deliveryTime(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.branchesService.getDeliveryTime(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
    RolesEnum.STAFF,
  )
  @Put(':id/delivery-time')
  updateDeliveryTime(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDeliveryTimeDto,
  ) {
    return this.branchesService.updateDeliveryTime(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
    RolesEnum.CUSTOMER,
    RolesEnum.STAFF,
  )
  @Get(':id/delivery-hours')
  deliveryHours(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.branchesService.getDeliveryHours(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
    RolesEnum.STAFF,
  )
  @Put(':id/delivery-hours')
  updateDeliveryHours(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDeliveryHoursDto,
  ) {
    return this.branchesService.updateDeliveryHours(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
    RolesEnum.STAFF,
  )
  @Patch(':id/temporary-closure')
  updateTemporaryClosure(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateBranchTemporaryClosureDto,
  ) {
    return this.branchesService.updateTemporaryClosure(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
    RolesEnum.STAFF,
  )
  @Patch(':id/notification-settings')
  updateNotificationSettings(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateBranchNotificationSettingsDto,
  ) {
    return this.branchesService.updateNotificationSettings(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
    RolesEnum.STAFF,
  )
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branchesService.update(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Patch(':id/suspend')
  suspend(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.branchesService.suspend(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Patch(':id/activate')
  activate(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.branchesService.activate(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Patch(':id/default')
  setDefault(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.branchesService.setDefault(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Post(':id/restore')
  restore(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.branchesService.restore(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
    RolesEnum.STAFF,
  )
  @Patch(':id/images')
  updateImages(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateBranchImagesDto,
  ) {
    return this.branchesService.updateImages(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.branchesService.remove(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Post('orphans/:id/cleanup')
  cleanupOrphanedBranchResources(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: CleanupOrphanBranchDto,
  ) {
    return this.branchesService.cleanupOrphanedBranchResources(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Delete(':id/force')
  forceDelete(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.branchesService.forceDelete(user, id);
  }
}
