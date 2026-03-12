import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreateBranchDto } from './create-branch.dto';

export class BulkBranchItemDto extends OmitType(CreateBranchDto, [
  'restaurantId',
  'branchAdmin',
] as const) {}

export class BulkCreateBranchesDto {
  @ApiPropertyOptional({
    description:
      'Optional for branch/business admin (token restaurant scope is used). Required for super admin.',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiProperty({ type: BulkBranchItemDto, isArray: true })
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BulkBranchItemDto)
  branches!: BulkBranchItemDto[];
}
