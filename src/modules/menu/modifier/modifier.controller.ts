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
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  AttachModifierToGroupDto,
  CreateModifierCategoryDto,
  CreateModifierDto,
  CreateModifierGroupDto,
  DuplicateModifierDto,
  ListModifierCategoriesDto,
  ListModifierGroupsDto,
  ListModifiersDto,
  SyncModifierGroupCategoriesDto,
  UpdateModifierCategoryDto,
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
  @Post('modifier-categories')
  createCategory(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateModifierCategoryDto,
  ) {
    return this.modifierService.createCategory(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get('modifier-categories')
  listCategories(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListModifierCategoriesDto,
  ) {
    return this.modifierService.listCategories(user, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Patch('modifier-categories/:id')
  updateCategory(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateModifierCategoryDto,
  ) {
    return this.modifierService.updateCategory(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Delete('modifier-categories/:id')
  removeCategory(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
  ) {
    return this.modifierService.removeCategory(user, id);
  }

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
    RolesEnum.CUSTOMER,
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
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get('modifier-groups/:groupId/categories')
  listModifierGroupCategories(
    @CurrentUser() user: AuthUserContext,
    @Param('groupId') groupId: string,
  ) {
    return this.modifierService.listGroupCategories(user, groupId);
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
  @Put('modifier-groups/:groupId/categories')
  syncModifierGroupCategories(
    @CurrentUser() user: AuthUserContext,
    @Param('groupId') groupId: string,
    @Body() dto: SyncModifierGroupCategoriesDto,
  ) {
    return this.modifierService.syncGroupCategories(user, groupId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get('modifiers')
  listModifiers(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListModifiersDto,
  ) {
    return this.modifierService.listModifiers(user, query);
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
  @Post('modifiers/:id/duplicate')
  @ApiOperation({ summary: 'Duplicate a modifier by id' })
  @ApiBody({ required: false, type: DuplicateModifierDto })
  duplicateModifier(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto?: DuplicateModifierDto,
  ) {
    return this.modifierService.duplicateModifier(user, id, dto ?? {});
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
  @Post('modifier-groups/:groupId/modifiers/:modifierId')
  attachModifierToGroup(
    @CurrentUser() user: AuthUserContext,
    @Param('groupId') groupId: string,
    @Param('modifierId') modifierId: string,
    @Body() dto: AttachModifierToGroupDto,
  ) {
    return this.modifierService.attachModifierToGroup(
      user,
      groupId,
      modifierId,
      dto,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Delete('modifier-groups/:groupId/modifiers/:modifierId')
  detachModifierFromGroup(
    @CurrentUser() user: AuthUserContext,
    @Param('groupId') groupId: string,
    @Param('modifierId') modifierId: string,
  ) {
    return this.modifierService.detachModifierFromGroup(
      user,
      groupId,
      modifierId,
    );
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

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Delete('items/:itemId/modifier-groups/:groupId')
  detachModifierGroupFromItem(
    @CurrentUser() user: AuthUserContext,
    @Param('itemId') itemId: string,
    @Param('groupId') groupId: string,
  ) {
    return this.modifierService.detachGroupFromItem(user, itemId, groupId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get('categories/:categoryId/modifier-groups')
  listCategoryModifierGroups(
    @CurrentUser() user: AuthUserContext,
    @Param('categoryId') categoryId: string,
  ) {
    return this.modifierService.listCategoryGroups(user, categoryId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Post('categories/:categoryId/modifier-groups/:groupId')
  attachModifierGroupToCategory(
    @CurrentUser() user: AuthUserContext,
    @Param('categoryId') categoryId: string,
    @Param('groupId') groupId: string,
    @Body() dto: AttachModifierGroupDto,
  ) {
    return this.modifierService.attachGroupToCategory(
      user,
      categoryId,
      groupId,
      dto,
    );
  }
}
