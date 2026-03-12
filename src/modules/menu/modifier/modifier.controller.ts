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
  AttachModifierGroupDto,
  CreateModifierDto,
  CreateModifierGroupDto,
  ListModifierGroupsDto,
  UpdateModifierDto,
  UpdateModifierGroupDto,
} from './dto';
import { ModifierService } from './modifier.service';

@ApiTags('Menu Modifiers')
@Controller('menu')
export class ModifierController {
  constructor(private readonly modifierService: ModifierService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Post('modifier-groups')
  createGroup(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateModifierGroupDto,
  ) {
    return this.modifierService.createGroup(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Get('modifier-groups')
  listGroups(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListModifierGroupsDto,
  ) {
    return this.modifierService.listGroups(user, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Patch('modifier-groups/:id')
  updateGroup(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateModifierGroupDto,
  ) {
    return this.modifierService.updateGroup(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Delete('modifier-groups/:id')
  removeGroup(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.modifierService.removeGroup(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Post('modifiers')
  createModifier(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateModifierDto,
  ) {
    return this.modifierService.createModifier(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Patch('modifiers/:id')
  updateModifier(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateModifierDto,
  ) {
    return this.modifierService.updateModifier(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Delete('modifiers/:id')
  removeModifier(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
  ) {
    return this.modifierService.removeModifier(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Post('items/:itemId/modifier-groups/:groupId')
  attachModifierGroupToItem(
    @CurrentUser() user: AuthUserContext,
    @Param('itemId') itemId: string,
    @Param('groupId') groupId: string,
    @Body() dto: AttachModifierGroupDto,
  ) {
    return this.modifierService.attachGroupToItem(user, itemId, groupId, dto);
  }
}
