import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import {
  BranchSettingsDto,
  CreateBranchAdminDto,
  CreateBranchDto,
} from './create-branch.dto';

export class UpdateBranchAdminDto extends PartialType(CreateBranchAdminDto) {}

export class UpdateBranchSettingsDto extends PartialType(BranchSettingsDto) {}

export class UpdateBranchDto extends PartialType(
  OmitType(CreateBranchDto, ['branchAdmin', 'settings'] as const),
) {
  @ApiPropertyOptional({
    type: UpdateBranchAdminDto,
    description: 'Branch admin fields to update.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateBranchAdminDto)
  branchAdmin?: UpdateBranchAdminDto;

  @ApiPropertyOptional({
    type: UpdateBranchSettingsDto,
    description: 'Only branch settings included in the patch are updated.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateBranchSettingsDto)
  settings?: UpdateBranchSettingsDto;
}
