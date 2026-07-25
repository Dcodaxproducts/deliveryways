import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AllowUnverified,
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
  AdminUpdatePaymentStatusDto,
  CreateRestaurantPayoutRequestDto,
  CreateRestaurantPayoutProviderRequestDto,
  CreateRestaurantProviderPayoutDto,
  CreateRestaurantStripeTransferDto,
  CreatePaymentAttemptDto,
  CreateSubscriptionPaymentAttemptDto,
  ListPaymentsDto,
  ListRestaurantPayoutRequestsDto,
  MarkRestaurantPayoutPaidDto,
  MarkSubscriptionManualPaidDto,
  RejectRestaurantPayoutProviderRequestDto,
  RefundPaymentDto,
  RestaurantPaymentManagementQueryDto,
  ReviewRestaurantPayoutRequestDto,
  ReviewRestaurantPayoutProviderRequestDto,
  RestaurantPayoutProvider,
  UpdateRestaurantPaymentMethodsDto,
  UpdateRestaurantPayoutProviderConfigurationDto,
  UpdateRestaurantStripeAccountDto,
  UpdatePaymentStatusDto,
  SendSubscriptionPaymentRequestDto,
} from './dto';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Post('webhooks/stripe')
  @ApiOperation({ summary: 'Stripe webhook receiver' })
  handleStripeWebhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ) {
    return this.paymentsService.handleStripeWebhook(request.rawBody, signature);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Post('orders/:orderId/attempts')
  createAttempt(
    @CurrentUser() user: AuthUserContext,
    @Param('orderId') orderId: string,
    @Body() dto: CreatePaymentAttemptDto,
  ) {
    return this.paymentsService.createAttempt(user, orderId, dto);
  }

  @ApiBearerAuth()
  @AllowUnverified()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Post('subscriptions/:subscriptionId/attempts')
  @ApiOperation({
    summary: 'Create Stripe payment intent for tenant subscription fee',
  })
  createSubscriptionAttempt(
    @CurrentUser() user: AuthUserContext,
    @Param('subscriptionId') subscriptionId: string,
    @Body() dto: CreateSubscriptionPaymentAttemptDto,
  ) {
    return this.paymentsService.createSubscriptionAttempt(
      user,
      subscriptionId,
      dto,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Post('subscriptions/:subscriptionId/payment-request')
  @ApiOperation({
    summary: 'Create and email a tenant subscription payment request',
  })
  sendSubscriptionPaymentRequest(
    @CurrentUser() user: AuthUserContext,
    @Param('subscriptionId') subscriptionId: string,
    @Body() dto: SendSubscriptionPaymentRequestDto,
  ) {
    return this.paymentsService.sendSubscriptionPaymentRequest(
      user,
      subscriptionId,
      dto,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Post('subscriptions/:subscriptionId/mark-manual-paid')
  @ApiOperation({ summary: 'Mark tenant subscription paid manually' })
  markSubscriptionManualPaid(
    @CurrentUser() user: AuthUserContext,
    @Param('subscriptionId') subscriptionId: string,
    @Body() dto: MarkSubscriptionManualPaidDto,
  ) {
    return this.paymentsService.markSubscriptionManualPaid(
      user,
      subscriptionId,
      dto,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get()
  list(@CurrentUser() user: AuthUserContext, @Query() query: ListPaymentsDto) {
    return this.paymentsService.list(user, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Get('restaurants/:restaurantId/management')
  @ApiOperation({
    summary:
      'Get restaurant payment methods, payout, wallet, and ledger summary',
  })
  getRestaurantPaymentManagement(
    @CurrentUser() user: AuthUserContext,
    @Param('restaurantId') restaurantId: string,
    @Query() query: RestaurantPaymentManagementQueryDto,
  ) {
    return this.paymentsService.getRestaurantPaymentManagement(
      user,
      restaurantId,
      query,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Patch('restaurants/:restaurantId/methods')
  @ApiOperation({ summary: 'Update restaurant payment method settings' })
  updateRestaurantPaymentMethods(
    @CurrentUser() user: AuthUserContext,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: UpdateRestaurantPaymentMethodsDto,
  ) {
    return this.paymentsService.updateRestaurantPaymentMethods(
      user,
      restaurantId,
      dto,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Get('restaurants/:restaurantId/wallet')
  @ApiOperation({ summary: 'Get restaurant wallet balance and recent ledger' })
  getRestaurantWallet(
    @CurrentUser() user: AuthUserContext,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.paymentsService.getRestaurantWallet(user, restaurantId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Get('restaurants/:restaurantId/payout-requests')
  @ApiOperation({ summary: 'List restaurant payout requests' })
  listRestaurantPayoutRequests(
    @CurrentUser() user: AuthUserContext,
    @Param('restaurantId') restaurantId: string,
    @Query() query: ListRestaurantPayoutRequestsDto,
  ) {
    return this.paymentsService.listRestaurantPayoutRequests(
      user,
      restaurantId,
      query,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.BRANCH_ADMIN)
  @Post('restaurants/:restaurantId/payout-requests')
  @ApiOperation({ summary: 'Request manual restaurant wallet payout' })
  createRestaurantPayoutRequest(
    @CurrentUser() user: AuthUserContext,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateRestaurantPayoutRequestDto,
  ) {
    return this.paymentsService.createRestaurantPayoutRequest(
      user,
      restaurantId,
      dto,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Get('restaurants/:restaurantId/payout-provider-requests')
  @ApiOperation({
    summary: 'Get redacted restaurant payout provider configuration requests',
  })
  getRestaurantPayoutProviderRequests(
    @CurrentUser() user: AuthUserContext,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.paymentsService.getRestaurantPayoutProviderRequests(
      user,
      restaurantId,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN)
  @Post('restaurants/:restaurantId/payout-provider-requests')
  @ApiOperation({
    summary: 'Submit Stripe or PayPal payout configuration for review',
  })
  createRestaurantPayoutProviderRequest(
    @CurrentUser() user: AuthUserContext,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateRestaurantPayoutProviderRequestDto,
  ) {
    return this.paymentsService.createRestaurantPayoutProviderRequest(
      user,
      restaurantId,
      dto,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Post('restaurants/:restaurantId/payout-provider-requests/:provider/approve')
  approveRestaurantPayoutProviderRequest(
    @CurrentUser() user: AuthUserContext,
    @Param('restaurantId') restaurantId: string,
    @Param('provider', new ParseEnumPipe(RestaurantPayoutProvider))
    provider: RestaurantPayoutProvider,
    @Body() dto: ReviewRestaurantPayoutProviderRequestDto,
  ) {
    return this.paymentsService.approveRestaurantPayoutProviderRequest(
      user,
      restaurantId,
      provider,
      dto,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Post('restaurants/:restaurantId/payout-provider-requests/:provider/reject')
  rejectRestaurantPayoutProviderRequest(
    @CurrentUser() user: AuthUserContext,
    @Param('restaurantId') restaurantId: string,
    @Param('provider', new ParseEnumPipe(RestaurantPayoutProvider))
    provider: RestaurantPayoutProvider,
    @Body() dto: RejectRestaurantPayoutProviderRequestDto,
  ) {
    return this.paymentsService.rejectRestaurantPayoutProviderRequest(
      user,
      restaurantId,
      provider,
      dto,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Patch('restaurants/:restaurantId/payout-providers/:provider')
  @ApiOperation({
    summary: 'Enable or disable an approved restaurant payout provider',
  })
  updateRestaurantPayoutProviderConfiguration(
    @CurrentUser() user: AuthUserContext,
    @Param('restaurantId') restaurantId: string,
    @Param('provider', new ParseEnumPipe(RestaurantPayoutProvider))
    provider: RestaurantPayoutProvider,
    @Body() dto: UpdateRestaurantPayoutProviderConfigurationDto,
  ) {
    return this.paymentsService.updateRestaurantPayoutProviderConfiguration(
      user,
      restaurantId,
      provider,
      dto,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Post('restaurants/:restaurantId/provider-payouts')
  @ApiOperation({
    summary: 'Transfer a wallet payout through an approved provider',
  })
  createRestaurantProviderPayout(
    @CurrentUser() user: AuthUserContext,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateRestaurantProviderPayoutDto,
  ) {
    return this.paymentsService.createRestaurantProviderPayout(
      user,
      restaurantId,
      dto,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Post('restaurant-payout-requests/:id/approve')
  approveRestaurantPayoutRequest(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: ReviewRestaurantPayoutRequestDto,
  ) {
    return this.paymentsService.approveRestaurantPayoutRequest(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Post('restaurant-payout-requests/:id/reject')
  rejectRestaurantPayoutRequest(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: ReviewRestaurantPayoutRequestDto,
  ) {
    return this.paymentsService.rejectRestaurantPayoutRequest(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Post('restaurant-payout-requests/:id/mark-paid')
  markRestaurantPayoutPaid(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: MarkRestaurantPayoutPaidDto,
  ) {
    return this.paymentsService.markRestaurantPayoutPaid(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Get('stripe/restaurants/:restaurantId/account')
  getRestaurantStripeAccount(
    @CurrentUser() user: AuthUserContext,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.paymentsService.getRestaurantStripeAccount(user, restaurantId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Patch('stripe/restaurants/:restaurantId/account')
  updateRestaurantStripeAccount(
    @CurrentUser() user: AuthUserContext,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: UpdateRestaurantStripeAccountDto,
  ) {
    return this.paymentsService.updateRestaurantStripeAccount(
      user,
      restaurantId,
      dto,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Post('stripe/restaurants/:restaurantId/transfers')
  createRestaurantStripeTransfer(
    @CurrentUser() user: AuthUserContext,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateRestaurantStripeTransferDto,
  ) {
    return this.paymentsService.createRestaurantStripeTransfer(
      user,
      restaurantId,
      dto,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get(':id')
  details(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.paymentsService.details(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update payment status for order or wallet top-up transactions',
  })
  updateStatus(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: AdminUpdatePaymentStatusDto,
  ) {
    return this.paymentsService.updateStatus(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Post(':id/mark-paid')
  markPaid(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
  ) {
    return this.paymentsService.markPaid(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Post(':id/fail')
  fail(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
  ) {
    return this.paymentsService.fail(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
  ) {
    return this.paymentsService.cancel(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Post(':id/refund')
  refund(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: RefundPaymentDto,
  ) {
    return this.paymentsService.refund(user, id, dto);
  }
}
