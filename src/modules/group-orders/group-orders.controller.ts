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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUserContext, CurrentUser, Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import {
  AddGroupOrderItemDto,
  CheckoutGroupOrderDto,
  CreateGroupOrderSessionDto,
  JoinGroupOrderDto,
  ListGroupOrdersDto,
  UpdateGroupOrderItemDto,
  UpdateGroupOrderParticipantStatusDto,
  UpdateGroupOrderSessionDto,
  UpdateGroupOrderStatusDto,
} from './dto';
import { GroupOrdersService } from './group-orders.service';

@ApiTags('Group Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('group-orders')
export class GroupOrdersController {
  constructor(private readonly groupOrdersService: GroupOrdersService) {}

  @Roles(RolesEnum.CUSTOMER)
  @Post()
  create(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateGroupOrderSessionDto,
  ) {
    return this.groupOrdersService.create(user, dto);
  }

  @Roles(RolesEnum.CUSTOMER)
  @Post('join')
  join(@CurrentUser() user: AuthUserContext, @Body() dto: JoinGroupOrderDto) {
    return this.groupOrdersService.join(user, dto);
  }

  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN, RolesEnum.CUSTOMER)
  @Get()
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListGroupOrdersDto,
  ) {
    return this.groupOrdersService.list(user, query);
  }

  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN, RolesEnum.CUSTOMER)
  @Get(':id')
  details(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.groupOrdersService.details(user, id);
  }

  @Roles(RolesEnum.CUSTOMER)
  @Patch(':id/settings')
  updateSettings(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateGroupOrderSessionDto,
  ) {
    return this.groupOrdersService.updateSettings(user, id, dto);
  }

  @Roles(RolesEnum.CUSTOMER)
  @Post(':id/items')
  addItem(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: AddGroupOrderItemDto,
  ) {
    return this.groupOrdersService.addItem(user, id, dto);
  }

  @Roles(RolesEnum.CUSTOMER)
  @Patch(':id/items/:itemId')
  updateItem(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateGroupOrderItemDto,
  ) {
    return this.groupOrdersService.updateItem(user, id, itemId, dto);
  }

  @Roles(RolesEnum.CUSTOMER)
  @Delete(':id/items/:itemId')
  removeItem(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.groupOrdersService.removeItem(user, id, itemId);
  }

  @Roles(RolesEnum.CUSTOMER)
  @Post(':id/leave')
  leave(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.groupOrdersService.leave(user, id);
  }

  @Roles(RolesEnum.CUSTOMER)
  @Patch(':id/participants/me/status')
  updateMyParticipantStatus(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateGroupOrderParticipantStatusDto,
  ) {
    return this.groupOrdersService.updateMyParticipantStatus(user, id, dto);
  }

  @Roles(RolesEnum.CUSTOMER)
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateGroupOrderStatusDto,
  ) {
    return this.groupOrdersService.updateStatus(user, id, dto);
  }

  @Roles(RolesEnum.CUSTOMER)
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.groupOrdersService.cancel(user, id);
  }

  @Roles(RolesEnum.CUSTOMER)
  @Post(':id/quote')
  quote(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.groupOrdersService.quote(user, id);
  }

  @Roles(RolesEnum.CUSTOMER)
  @Post(':id/checkout')
  checkout(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: CheckoutGroupOrderDto,
  ) {
    return this.groupOrdersService.checkout(user, id, dto);
  }
}
