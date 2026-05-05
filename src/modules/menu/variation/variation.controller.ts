import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
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
  CreateMenuVariationDto,
  ListMenuVariationsDto,
  SyncCategoryVariationsDto,
  UpdateMenuVariationDto,
} from './dto';
import { MenuVariationService } from './variation.service';

@ApiTags('Menu Variations')
@Controller('menu')
export class MenuVariationController {
  constructor(private readonly menuVariationService: MenuVariationService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Post('variations')
  create(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateMenuVariationDto,
  ) {
    return this.menuVariationService.create(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get('variations')
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListMenuVariationsDto,
  ) {
    return this.menuVariationService.list(user, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Put('categories/:categoryId/variations')
  syncCategoryVariations(
    @CurrentUser() user: AuthUserContext,
    @Param('categoryId') categoryId: string,
    @Body() dto: SyncCategoryVariationsDto,
  ) {
    return this.menuVariationService.syncCategoryVariations(
      user,
      categoryId,
      dto,
    );
  }

  @Patch('variations/:id')
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateMenuVariationDto,
  ) {
    return this.menuVariationService.update(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Delete('variations/:id')
  remove(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.menuVariationService.remove(user, id);
  }
}
