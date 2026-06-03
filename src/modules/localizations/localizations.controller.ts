import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
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
import { ListEntityTranslationsDto, UpsertEntityTranslationDto } from './dto';
import { LocalizationsService } from './localizations.service';

@ApiTags('Localizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
@Controller('localizations')
export class LocalizationsController {
  constructor(private readonly localizationsService: LocalizationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListEntityTranslationsDto,
  ) {
    return this.localizationsService.list(user, query);
  }

  @Put(':entityType/:entityId/:locale')
  upsert(
    @CurrentUser() user: AuthUserContext,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Param('locale') locale: string,
    @Body() dto: UpsertEntityTranslationDto,
  ) {
    return this.localizationsService.upsert(
      user,
      entityType,
      entityId,
      locale,
      dto,
    );
  }

  @Delete(':entityType/:entityId/:locale')
  deactivate(
    @CurrentUser() user: AuthUserContext,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Param('locale') locale: string,
    @Query('restaurantId') restaurantId?: string,
  ) {
    return this.localizationsService.deactivate(
      user,
      entityType,
      entityId,
      locale,
      restaurantId,
    );
  }
}
