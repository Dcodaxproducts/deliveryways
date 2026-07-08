import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  CreatePermissionModuleDto,
  ListPermissionModulesDto,
  UpdatePermissionModuleDto,
} from './dto';
import { PermissionModulesService } from './permission-modules.service';

@ApiTags('Permission Modules')
@ApiBearerAuth()
@Controller('permission-modules')
export class PermissionModulesController {
  constructor(
    private readonly permissionModulesService: PermissionModulesService,
  ) {}

  @Post()
  @Roles(RolesEnum.SUPER_ADMIN)
  create(@Body() dto: CreatePermissionModuleDto) {
    return this.permissionModulesService.create(dto);
  }

  @Get()
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  list(@Query() query: ListPermissionModulesDto) {
    return this.permissionModulesService.list(query);
  }

  @Get(':id')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  details(@Param('id') id: string) {
    return this.permissionModulesService.details(id);
  }

  @Patch(':id')
  @Roles(RolesEnum.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdatePermissionModuleDto) {
    return this.permissionModulesService.update(id, dto);
  }
}
