import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateBranchImagesDto {
  @ApiPropertyOptional({
    description: 'Branch logo URL (uploaded by frontend)',
  })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'Branch cover image URL (uploaded by frontend)',
  })
  @IsOptional()
  @IsString()
  coverImage?: string;
}
