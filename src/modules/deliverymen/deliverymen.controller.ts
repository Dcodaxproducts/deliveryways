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
import { Throttle } from '@nestjs/throttler';
import {
  AuthUserContext,
  CurrentUser,
  Public,
  Roles,
} from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import {
  AssignDeliverymanOrderDto,
  CreateDeliverymanDto,
  DeliverymanSignupDto,
  ListDeliverymenDto,
  UpdateMyDeliverymanProfileDto,
  UpdateMyDeliverymanStatusDto,
  UpdateMyDeliverymanTwoFactorDto,
  UpdateDeliverymanDto,
  UpdateDeliverymanLocationDto,
  UpdateDeliverymanStatusDto,
} from './dto';
import {
  CreateAddressDto,
  ListAddressesDto,
  UpdateAddressDto,
} from '../addresses/dto';
import { DeliverymenService } from './deliverymen.service';

@ApiTags('Deliverymen')
@Controller('deliverymen')
export class DeliverymenController {
  constructor(private readonly deliverymenService: DeliverymenService) {}

  @Public()
  @Throttle({ default: { ttl: 10 * 60_000, limit: 5 } })
  @Post('signup')
  @ApiOperation({ summary: 'Public deliveryman signup for rider app' })
  signup(@Body() dto: DeliverymanSignupDto) {
    return this.deliverymenService.signup(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.DELIVERYMAN)
  @Get('me/profile')
  @ApiOperation({ summary: 'Fetch deliveryman own profile for driver app' })
  myProfile(@CurrentUser() user: AuthUserContext) {
    return this.deliverymenService.myProfile(user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.DELIVERYMAN)
  @Patch('me/profile')
  @ApiOperation({ summary: 'Update deliveryman own profile and vehicle info' })
  updateMyProfile(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateMyDeliverymanProfileDto,
  ) {
    return this.deliverymenService.updateMyProfile(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.DELIVERYMAN)
  @Patch('me/2fa')
  @ApiOperation({ summary: 'Enable or disable deliveryman 2FA' })
  updateMyTwoFactor(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateMyDeliverymanTwoFactorDto,
  ) {
    return this.deliverymenService.updateMyTwoFactor(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.DELIVERYMAN)
  @Get('me/earnings')
  @ApiOperation({
    summary: 'Fetch deliveryman earnings summary and recent deliveries',
  })
  myEarnings(@CurrentUser() user: AuthUserContext) {
    return this.deliverymenService.myEarnings(user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.DELIVERYMAN)
  @Get('me/addresses')
  @ApiOperation({ summary: 'List deliveryman own addresses' })
  listMyAddresses(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListAddressesDto,
  ) {
    return this.deliverymenService.listMyAddresses(user, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.DELIVERYMAN)
  @Post('me/addresses')
  @ApiOperation({ summary: 'Create deliveryman own address' })
  createMyAddress(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateAddressDto,
  ) {
    return this.deliverymenService.createMyAddress(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.DELIVERYMAN)
  @Patch('me/addresses/:id')
  @ApiOperation({ summary: 'Update deliveryman own address' })
  updateMyAddress(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.deliverymenService.updateMyAddress(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.DELIVERYMAN)
  @Delete('me/addresses/:id')
  @ApiOperation({ summary: 'Delete deliveryman own address' })
  removeMyAddress(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
  ) {
    return this.deliverymenService.removeMyAddress(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.DELIVERYMAN)
  @Post('me/accept-order')
  @ApiOperation({ summary: 'Accept an available delivery order' })
  acceptOrder(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: AssignDeliverymanOrderDto,
  ) {
    return this.deliverymenService.acceptOrder(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Post()
  create(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateDeliverymanDto,
  ) {
    return this.deliverymenService.create(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Get()
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListDeliverymenDto,
  ) {
    return this.deliverymenService.list(user, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.DELIVERYMAN)
  @Patch('me/location')
  @ApiOperation({ summary: 'Update deliveryman live location' })
  updateMyLocation(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateDeliverymanLocationDto,
  ) {
    return this.deliverymenService.updateMyLocation(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.DELIVERYMAN)
  @Patch('me/status')
  @ApiOperation({
    summary: 'Update deliveryman own availability status',
  })
  updateMyStatus(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateMyDeliverymanStatusDto,
  ) {
    return this.deliverymenService.updateMyStatus(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Get(':id')
  details(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.deliverymenService.details(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateDeliverymanDto,
  ) {
    return this.deliverymenService.update(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.DELIVERYMAN,
  )
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateDeliverymanStatusDto,
  ) {
    return this.deliverymenService.updateStatus(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Post(':id/assign-order')
  assignOrder(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: AssignDeliverymanOrderDto,
  ) {
    return this.deliverymenService.assignOrder(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Delete(':id')
  remove(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.deliverymenService.remove(user, id);
  }
}
