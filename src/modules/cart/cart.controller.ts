import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { AddCartItemDto, UpdateCartContextDto, UpdateCartItemDto } from './dto';
import { CartService } from './cart.service';

@ApiTags('Cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(RolesEnum.CUSTOMER)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser() user: AuthUserContext) {
    return this.cartService.getCart(user);
  }

  @Patch('context')
  updateContext(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateCartContextDto,
  ) {
    return this.cartService.updateContext(user, dto);
  }

  @Post('items')
  addItem(@CurrentUser() user: AuthUserContext, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user, dto);
  }

  @Patch('items/:itemId')
  updateItem(
    @CurrentUser() user: AuthUserContext,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(user, itemId, dto);
  }

  @Delete('items/:itemId')
  removeItem(
    @CurrentUser() user: AuthUserContext,
    @Param('itemId') itemId: string,
  ) {
    return this.cartService.removeItem(user, itemId);
  }

  @Delete()
  clearCart(@CurrentUser() user: AuthUserContext) {
    return this.cartService.clearCart(user);
  }

  @Post('quote')
  quote(@CurrentUser() user: AuthUserContext) {
    return this.cartService.quote(user);
  }
}
