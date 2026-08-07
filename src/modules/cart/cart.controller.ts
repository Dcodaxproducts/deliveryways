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
  AddCartItemDto,
  AddCartItemScopeDto,
  AddCartDealDto,
  AddCartItemsBatchDto,
  CartCustomerScopeDto,
  CheckoutCartDto,
  QuoteCartDto,
  ReorderCartDto,
  UpdateCartDealDto,
  UpdateCartAddressDto,
  UpdateCartCouponDto,
  UpdateCartDto,
  UpdateCartItemDto,
  UpdateCartOrderTypeDto,
} from './dto';
import { CartService } from './cart.service';

@ApiTags('Cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(
  RolesEnum.SUPER_ADMIN,
  RolesEnum.BUSINESS_ADMIN,
  RolesEnum.BRANCH_ADMIN,
  RolesEnum.CUSTOMER,
)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('deals')
  addDeal(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: AddCartDealDto,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.addDealItems(
      user,
      dto,
      scope.customerId,
      scope.restaurantId,
    );
  }

  @Get()
  getCart(
    @CurrentUser() user: AuthUserContext,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.getCart(user, scope.customerId, scope.restaurantId);
  }

  @Patch()
  updateCart(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateCartDto,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.updateCart(
      user,
      dto,
      scope.customerId,
      scope.restaurantId,
    );
  }

  @Patch('order-type')
  updateOrderType(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateCartOrderTypeDto,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.updateOrderType(
      user,
      dto,
      scope.customerId,
      scope.restaurantId,
    );
  }

  @Patch('address')
  updateAddress(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateCartAddressDto,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.updateAddress(
      user,
      dto,
      scope.customerId,
      scope.restaurantId,
    );
  }

  @Patch('coupon')
  applyCoupon(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateCartCouponDto,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.applyCoupon(
      user,
      dto,
      scope.customerId,
      scope.restaurantId,
    );
  }

  @Delete('coupon')
  removeCoupon(
    @CurrentUser() user: AuthUserContext,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.removeCoupon(
      user,
      scope.customerId,
      scope.restaurantId,
    );
  }

  @Post('reorder')
  reorder(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: ReorderCartDto,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.reorder(
      user,
      dto,
      scope.customerId,
      scope.restaurantId,
    );
  }

  @Post('items')
  addItem(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: AddCartItemDto,
    @Query() scope: AddCartItemScopeDto,
  ) {
    return this.cartService.addItem(
      user,
      dto,
      scope.customerId,
      scope.restaurantId,
      scope.compact === true,
    );
  }

  @Post('items/batch')
  addItemsBatch(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: AddCartItemsBatchDto,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.addItemsBatch(
      user,
      dto.items,
      scope.customerId,
      scope.restaurantId,
    );
  }

  @Patch('items/:itemId')
  updateItem(
    @CurrentUser() user: AuthUserContext,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.updateItem(
      user,
      itemId,
      dto,
      scope.customerId,
      scope.restaurantId,
    );
  }

  @Delete('items/:itemId')
  removeItem(
    @CurrentUser() user: AuthUserContext,
    @Param('itemId') itemId: string,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.removeItem(
      user,
      itemId,
      scope.customerId,
      scope.restaurantId,
    );
  }

  @Patch('deals/:dealId')
  updateDeal(
    @CurrentUser() user: AuthUserContext,
    @Param('dealId') dealId: string,
    @Body() dto: UpdateCartDealDto,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.updateDeal(
      user,
      dealId,
      dto,
      scope.customerId,
      scope.restaurantId,
    );
  }

  @Delete('deals/:dealId')
  removeDeal(
    @CurrentUser() user: AuthUserContext,
    @Param('dealId') dealId: string,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.removeDeal(
      user,
      dealId,
      scope.customerId,
      scope.restaurantId,
    );
  }

  @Delete()
  clearCart(
    @CurrentUser() user: AuthUserContext,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.clearCart(
      user,
      scope.customerId,
      scope.restaurantId,
    );
  }

  @Post('quote')
  quote(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: QuoteCartDto,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.quote(
      user,
      dto,
      scope.customerId,
      scope.restaurantId,
    );
  }

  @Post('checkout')
  checkout(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CheckoutCartDto,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.checkout(
      user,
      dto,
      scope.customerId,
      scope.restaurantId,
    );
  }
}
