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
  CreatePosDraftItemDto,
  CreatePosOrderDto,
  ListPosOrdersDto,
  UpdatePosDraftItemDto,
  UpdatePosOrderDto,
} from './dto';
import { PosService } from './pos.service';

@ApiTags('POS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(
  RolesEnum.SUPER_ADMIN,
  RolesEnum.BUSINESS_ADMIN,
  RolesEnum.BRANCH_ADMIN,
  RolesEnum.STAFF,
)
@Controller('pos/orders')
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Post()
  create(@CurrentUser() user: AuthUserContext, @Body() dto: CreatePosOrderDto) {
    return this.posService.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUserContext, @Query() query: ListPosOrdersDto) {
    return this.posService.list(user, query);
  }

  @Get(':id')
  details(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.posService.details(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdatePosOrderDto,
  ) {
    return this.posService.update(user, id, dto);
  }

  @Post(':id/items')
  addItem(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: CreatePosDraftItemDto,
  ) {
    return this.posService.addItem(user, id, dto);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePosDraftItemDto,
  ) {
    return this.posService.updateItem(user, id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.posService.removeItem(user, id, itemId);
  }

  @Post(':id/quote')
  quote(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.posService.quote(user, id);
  }

  @Post(':id/checkout')
  checkout(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.posService.checkout(user, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.posService.cancel(user, id);
  }
}
