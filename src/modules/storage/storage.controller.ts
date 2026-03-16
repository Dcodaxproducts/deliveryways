import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUserContext, CurrentUser, Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import {
  CreatePresignedUploadUrlDto,
  CreatePresignedViewUrlDto,
  DeleteStoredFileDto,
} from './dto';
import { StorageService } from './storage.service';

@ApiTags('Storage')
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Post('presigned-upload')
  createPresignedUploadUrl(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreatePresignedUploadUrlDto,
  ) {
    return this.storageService.createPresignedUploadUrl(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Post('presigned-view')
  createPresignedViewUrl(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreatePresignedViewUrlDto,
  ) {
    return this.storageService.createPresignedViewUrl(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Delete('object')
  deleteObject(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: DeleteStoredFileDto,
  ) {
    return this.storageService.deleteObject(user, dto);
  }
}
