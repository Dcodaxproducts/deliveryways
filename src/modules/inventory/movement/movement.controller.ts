import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../../common/decorators';
import { AuthUserContext } from '../../../common/decorators';
import { RolesEnum } from '../../../common/enums';
import { JwtAuthGuard, RolesGuard, TenantAccessGuard } from '../../../common/guards';
import { CreateInventoryMovementDto, ListInventoryMovementsDto } from './dto';
import { InventoryMovementService } from './movement.service';

@ApiTags('Inventory Movements')
@Controller('inventory/movements')
export class InventoryMovementController {
  constructor(private readonly movementService: InventoryMovementService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN, RolesEnum.BRANCH_ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUserContext, @Body() dto: CreateInventoryMovementDto) {
    return this.movementService.create(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN, RolesEnum.BRANCH_ADMIN)
  @Get()
  list(@CurrentUser() user: AuthUserContext, @Query() query: ListInventoryMovementsDto) {
    return this.movementService.list(user, query);
  }
}
