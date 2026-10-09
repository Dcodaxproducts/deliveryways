import {
  Body,
  Controller,
  Delete,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthUserContext,
  CurrentUser,
  Public,
  Roles,
} from '../../common/decorators';
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
  UploadImageDto,
} from './dto';
import {
  MAX_IMAGE_UPLOAD_BYTES,
  UploadedImageFile,
} from './image-processor.service';
import { StorageService } from './storage.service';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

@ApiTags('Storage')
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post('presigned-upload')
  createPresignedUploadUrl(
    @CurrentUser() user: AuthUserContext | undefined,
    @Body() dto: CreatePresignedUploadUrlDto,
  ) {
    return this.storageService.createPresignedUploadUrl(user, dto);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post('upload-image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES, files: 1 },
    }),
  )
  uploadImage(
    @CurrentUser() user: AuthUserContext | undefined,
    @UploadedFile() file: UploadedImageFile | undefined,
    @Body() dto: UploadImageDto,
  ) {
    return this.storageService.uploadImage(user, file, dto);
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
