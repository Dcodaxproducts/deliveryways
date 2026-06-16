import {
  Controller,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUserContext, CurrentUser, Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import { AdminImportsService, UploadedCsvFile } from './admin-imports.service';

@ApiTags('Admin Imports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN, RolesEnum.BRANCH_ADMIN)
@Controller('admin/imports')
export class AdminImportsController {
  constructor(private readonly adminImportsService: AdminImportsService) {}

  @Post(':type/upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload filled CSV import file for deliverymen, coupons, promotions, or happy-hours',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  upload(
    @CurrentUser() user: AuthUserContext,
    @Param('type') type: string,
    @UploadedFile() file?: UploadedCsvFile,
  ) {
    return this.adminImportsService.uploadCsv(user, type, file);
  }
}
