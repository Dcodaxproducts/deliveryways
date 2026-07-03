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
import { CurrentUser, Roles } from '../../../common/decorators';
import { AuthUserContext } from '../../../common/decorators';
import { RolesEnum } from '../../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../../common/guards';
import {
  BulkCreateCuisinesDto,
  CreateCuisineDto,
  ListCuisinesAdminDto,
  ReorderCuisinesDto,
  UpdateCuisineDto,
} from './dto';
import { CuisineService } from './cuisine.service';

@ApiTags('Cuisines')
@Controller('menu/cuisines')
export class CuisineController {
  constructor(private readonly cuisineService: CuisineService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUserContext, @Body() dto: CreateCuisineDto) {
    return this.cuisineService.create(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Post('bulk')
  createBulk(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: BulkCreateCuisinesDto,
  ) {
    return this.cuisineService.createBulk(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Patch('reorder')
  reorder(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: ReorderCuisinesDto,
  ) {
    return this.cuisineService.reorder(user, dto);
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
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListCuisinesAdminDto,
  ) {
    return this.cuisineService.list(user, query);
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
  getById(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.cuisineService.getById(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateCuisineDto,
  ) {
    return this.cuisineService.update(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.cuisineService.remove(user, id);
  }
}
