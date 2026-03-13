import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  DevBootstrapSuperAdminDto,
  DevTokenDto,
  ForgotPasswordDto,
  ListCustomersDto,
  LoginDto,
  RefreshDto,
  RegisterCustomerDto,
  RegisterTenantDto,
  ResendOtpDto,
  ResetPasswordDto,
  UpdateMyAvatarDto,
  VerifyEmailDto,
} from './dto';
import {
  AllowUnverified,
  CurrentUser,
  Public,
  Roles,
} from '../../common/decorators';
import { AuthUserContext } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards';

@ApiTags('Auth')
@AllowUnverified()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register-tenant')
  registerTenant(@Body() dto: RegisterTenantDto) {
    return this.authService.registerTenant(dto);
  }

  @Public()
  @Post('register-customer')
  registerCustomer(@Body() dto: RegisterCustomerDto) {
    return this.authService.registerCustomer(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
  )
  @Get('customers')
  listCustomers(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListCustomersDto,
  ) {
    return this.authService.listCustomers(user, query);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshTokens(dto);
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

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('verify-email')
  verifyEmail(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: VerifyEmailDto,
  ) {
    return this.authService.verifyEmail(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('resend-verification')
  resendVerification(@CurrentUser() user: AuthUserContext) {
    return this.authService.resendVerification(user);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('resend-otp')
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
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
  @Delete('account')
  deleteAccount(@CurrentUser() user: AuthUserContext) {
    return this.authService.deleteAccount(user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('cancel-deletion')
  cancelDeletion(@CurrentUser() user: AuthUserContext) {
    return this.authService.cancelDeletion(user);
  }
}
