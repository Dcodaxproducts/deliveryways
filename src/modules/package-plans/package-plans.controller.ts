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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserContext, CurrentUser, Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import {
  AssignTenantSubscriptionDto,
  CreatePackagePlanDto,
  ListPackagePlansDto,
  ListTenantSubscriptionsDto,
  UpdatePackagePlanDto,
  UpdateTenantSubscriptionDto,
} from './dto';
import { PackagePlansService } from './package-plans.service';

@ApiTags('Package Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(RolesEnum.SUPER_ADMIN)
@Controller('admin/package-plans')
export class PackagePlansController {
  constructor(private readonly packagePlansService: PackagePlansService) {}

  @Post()
  @ApiOperation({ summary: 'Create package plan' })
  createPlan(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreatePackagePlanDto,
  ) {
    return this.packagePlansService.createPlan(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List package plans' })
  listPlans(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListPackagePlansDto,
  ) {
    return this.packagePlansService.listPlans(user, query);
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'List tenant subscriptions' })
  listSubscriptions(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListTenantSubscriptionsDto,
  ) {
    return this.packagePlansService.listSubscriptions(user, query);
  }

  @Get('features/catalog')
  @ApiOperation({ summary: 'List available package plan feature modules' })
  getFeatureCatalog(@CurrentUser() user: AuthUserContext) {
    return this.packagePlansService.getFeatureCatalog(user);
  }

  @Post('subscriptions')
  @ApiOperation({ summary: 'Assign package plan to tenant or restaurant' })
  assignSubscription(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: AssignTenantSubscriptionDto,
  ) {
    return this.packagePlansService.assignSubscription(user, dto);
  }

  @Patch('subscriptions/:id')
  @ApiOperation({ summary: 'Update tenant subscription' })
  updateSubscription(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateTenantSubscriptionDto,
  ) {
    return this.packagePlansService.updateSubscription(user, id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get package plan detail' })
  planDetails(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.packagePlansService.planDetails(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update package plan' })
  updatePlan(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdatePackagePlanDto,
  ) {
    return this.packagePlansService.updatePlan(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete package plan' })
  removePlan(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.packagePlansService.removePlan(user, id);
  }
}
