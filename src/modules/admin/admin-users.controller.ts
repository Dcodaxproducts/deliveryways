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
  AdminCustomerDetailsQueryDto,
  AdminForceDeleteUsersDto,
  AdminListCustomersDto,
  UpdateAdminCustomerStatusDto,
} from './dto';
import { AdminUsersService } from './admin-users.service';

@ApiTags('Admin Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get('customers')
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'List customers for admin/staff management' })
  listCustomers(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminListCustomersDto,
  ) {
    return this.adminUsersService.listCustomers(user, query);
  }

  @Get('customers/:id')
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Get customer details for admin/staff management' })
  customerDetails(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Query() query: AdminCustomerDetailsQueryDto,
  ) {
    return this.adminUsersService.customerDetails(user, id, query);
  }

  @Patch('customers/:id/status')
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Block or unblock a customer account' })
  updateCustomerStatus(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateAdminCustomerStatusDto,
  ) {
    return this.adminUsersService.updateCustomerStatus(user, id, dto);
  }

  @Delete(':id')
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Soft delete a lower-scope user account' })
  removeUser(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.adminUsersService.removeUser(user, id);
  }

  @Post('force-delete')
  @Roles(RolesEnum.SUPER_ADMIN)
  @ApiOperation({ summary: 'Force delete user accounts by email' })
  forceDeleteUsers(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: AdminForceDeleteUsersDto,
  ) {
    return this.adminUsersService.forceDeleteUsers(user, dto);
  }

  @Patch('business-admins/:id/approve')
  @Roles(RolesEnum.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve a pending business admin account' })
  approveBusinessAdmin(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
  ) {
    return this.adminUsersService.approveBusinessAdmin(user, id);
  }
}
