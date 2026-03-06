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
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminListQueryDto } from '../../common/dto';
import { CurrentUser, Roles } from '../../common/decorators';
import { AuthUserContext } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import { JwtAuthGuard, RolesGuard, TenantAccessGuard } from '../../common/guards';
import { AddressesService } from './addresses.service';
import { CreateAddressDto, UpdateAddressDto } from './dto';

@ApiTags('Addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Post()
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  create(@CurrentUser() user: AuthUserContext, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(user, dto);
  }

  @Get()
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @ApiQuery({ name: 'referenceId', required: true, example: 'clx...' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'sortBy', required: false, example: 'createdAt' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({
    name: 'withDeleted',
    required: false,
    description: 'Super admin only',
  })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    description: 'Admin only',
  })
  list(
    @CurrentUser() user: AuthUserContext,
    @Query('referenceId') referenceId: string,
    @Query() query: AdminListQueryDto,
  ) {
    return this.addressesService.list(user, referenceId, query);
  }

  @Patch(':id')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  remove(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.addressesService.remove(user, id);
  }
}
