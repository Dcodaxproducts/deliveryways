import {
  Controller,
  Get,
  Param,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import { AdminImportSamplesService } from './admin-import-samples.service';

@ApiTags('Admin Import Samples')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN, RolesEnum.BRANCH_ADMIN)
@Controller('admin/import-samples')
export class AdminImportSamplesController {
  constructor(
    private readonly adminImportSamplesService: AdminImportSamplesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List available import sample files' })
  listSamples() {
    return this.adminImportSamplesService.listSamples();
  }

  @Get(':type/download')
  @ApiOperation({ summary: 'Download an import sample CSV file' })
  downloadSample(
    @Param('type') type: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = this.adminImportSamplesService.getSample(type);

    response.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
    });

    return new StreamableFile(file.content);
  }
}
