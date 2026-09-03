import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { CreateBranchAdminDto, CreateBranchDto } from './create-branch.dto';

export class UpdateBranchAdminDto extends PartialType(CreateBranchAdminDto) {}

export class UpdateBranchDto extends PartialType(
  OmitType(CreateBranchDto, ['branchAdmin'] as const),
) {
  @ApiPropertyOptional({
    type: UpdateBranchAdminDto,
    description: 'Branch admin fields to update.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateBranchAdminDto)
  branchAdmin?: UpdateBranchAdminDto;
}
