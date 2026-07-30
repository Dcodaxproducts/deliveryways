import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  CancelDeletionByLoginDto,
  ChangePasswordDto,
  CheckEmailRoleDto,
  DevBootstrapSuperAdminDto,
  DevTokenDto,
  DevUserDeleteDto,
  DevUserLookupDto,
  DevUserUpdateDto,
  ForgotPasswordDto,
  GoogleLoginDto,
  LoginDto,
  RefreshDto,
  RegisterCustomerDto,
  RegisterGuestCustomerDto,
  RegisterTenantDto,
  ResendOtpDto,
  ResetPasswordDto,
  UpdateMyAvatarDto,
  UpdateMyProfileDto,
  VerifyDeliverymanTwoFactorDto,
  VerifyEmailDto,
} from './dto';
import {
  AllowSoftDeleted,
  AllowUnverified,
  CurrentUser,
  Public,
  Roles,
} from '../../common/decorators';
import { AuthUserContext } from '../../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { RolesEnum } from '../../common/enums';

const getGuestRegistrationTracker = (req: Record<string, unknown>): string => {
  const ipAddress =
    typeof req.ip === 'string' && req.ip.trim() ? req.ip.trim() : 'unknown-ip';
  const body = req.body;
  const restaurantId =
    typeof body === 'object' &&
    body !== null &&
    'restaurantId' in body &&
    typeof body.restaurantId === 'string' &&
    body.restaurantId.trim()
      ? body.restaurantId.trim()
      : 'unknown-restaurant';

  return `${ipAddress}:${restaurantId}`;
};

@ApiTags('Auth')
@AllowUnverified()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('check-email-role')
  checkEmailRole(@Body() dto: CheckEmailRoleDto) {
    return this.authService.checkEmailRole(dto);
  }

  @Public()
  @Post('register-tenant')
  registerTenant(@Body() dto: RegisterTenantDto) {
    return this.authService.registerTenant(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Post('admin/register-tenant')
  registerTenantBySuperAdmin(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: RegisterTenantDto,
  ) {
    return this.authService.registerTenantBySuperAdmin(user, dto);
  }

  @Public()
  @Post('register-customer')
  registerCustomer(
    @Body() dto: RegisterCustomerDto,
    @Headers('accept-language') locale?: string,
  ) {
    return this.authService.registerCustomer(dto, locale);
  }

  @Public()
  @Throttle({
    default: {
      ttl: 10 * 60_000,
      limit: 5,
      blockDuration: 30 * 60_000,
      getTracker: getGuestRegistrationTracker,
    },
  })
  @Post('register-guest')
  registerGuest(
    @Body() dto: RegisterGuestCustomerDto,
    @Headers('accept-language') locale?: string,
  ) {
    return this.authService.registerGuestCustomer(dto, locale);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('google-login')
  googleLogin(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto);
  }

  @Public()
  @Post('staff/login')
  staffLogin(@Body() dto: LoginDto) {
    return this.authService.loginStaff(dto);
  }

  @Public()
  @Post('deliveryman/login')
  deliverymanLogin(@Body() dto: LoginDto) {
    return this.authService.loginDeliveryman(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('deliveryman/2fa/verify')
  verifyDeliverymanTwoFactor(@Body() dto: VerifyDeliverymanTwoFactorDto) {
    return this.authService.verifyDeliverymanTwoFactor(dto);
  }

  @Public()
  @Post('cancel-deletion-login')
  cancelDeletionByLogin(@Body() dto: CancelDeletionByLoginDto) {
    return this.authService.cancelDeletionByLogin(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshTokens(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: AuthUserContext) {
    return this.authService.logout(user);
  }

  @Public()
  @Post('dev-token')
  devToken(@Body() dto: DevTokenDto) {
    return this.authService.generateDevToken(dto);
  }

  @Public()
  @Post('dev-bootstrap-super-admin')
  devBootstrapSuperAdmin(@Body() dto: DevBootstrapSuperAdminDto) {
    return this.authService.bootstrapDevSuperAdmin(dto);
  }

  @Public()
  @Get('dev-users')
  devUserDetails(@Query() query: DevUserLookupDto) {
    return this.authService.devUserDetails(query);
  }

  @Public()
  @Patch('dev-users')
  updateDevUser(@Body() dto: DevUserUpdateDto) {
    return this.authService.updateDevUser(dto);
  }

  @Public()
  @Delete('dev-users')
  deleteDevUser(
    @Query() query: DevUserDeleteDto,
    @Body() dto: DevUserDeleteDto = {},
  ) {
    return this.authService.deleteDevUser({ ...query, ...dto });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('verify-email')
  verifyEmail(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: VerifyEmailDto,
  ) {
    return this.authService.verifyEmail(user, dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('forgot-password')
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Headers('accept-language') locale?: string,
  ) {
    return this.authService.forgotPassword(dto, locale);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('resend-otp')
  resendOtp(
    @Body() dto: ResendOtpDto,
    @Headers('accept-language') locale?: string,
  ) {
    return this.authService.resendOtp(dto, locale);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('resend-verification')
  resendVerification(@CurrentUser() user: AuthUserContext) {
    return this.authService.resendVerification(user);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('change-password')
  changePassword(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUserContext) {
    return this.authService.me(user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('me/avatar')
  updateMyAvatar(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateMyAvatarDto,
  ) {
    return this.authService.updateMyAvatar(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('me/profile')
  updateMyProfile(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateMyProfileDto,
  ) {
    return this.authService.updateMyProfile(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('account')
  deleteAccount(@CurrentUser() user: AuthUserContext) {
    return this.authService.deleteAccount(user);
  }

  @AllowSoftDeleted()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('cancel-deletion')
  cancelDeletion(@CurrentUser() user: AuthUserContext) {
    return this.authService.cancelDeletion(user);
  }
}
