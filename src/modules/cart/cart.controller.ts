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
  CartCustomerScopeDto,
  UpdateCartContextDto,
  UpdateCartItemDto,
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

  @Get()
  getCart(
    @CurrentUser() user: AuthUserContext,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.getCart(user, scope.customerId);
  }

  @Patch('context')
  updateContext(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateCartContextDto,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.updateContext(user, dto, scope.customerId);
  }

  @Post('items')
  addItem(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: AddCartItemDto,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.addItem(user, dto, scope.customerId);
  }

  @Patch('items/:itemId')
  updateItem(
    @CurrentUser() user: AuthUserContext,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.updateItem(user, itemId, dto, scope.customerId);
  }

  @Delete('items/:itemId')
  removeItem(
    @CurrentUser() user: AuthUserContext,
    @Param('itemId') itemId: string,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.removeItem(user, itemId, scope.customerId);
  }

  @Delete()
  clearCart(
    @CurrentUser() user: AuthUserContext,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.clearCart(user, scope.customerId);
  }

  @Post('quote')
  quote(
    @CurrentUser() user: AuthUserContext,
    @Query() scope: CartCustomerScopeDto,
  ) {
    return this.cartService.quote(user, scope.customerId);
  }
}
