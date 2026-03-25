import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateRestaurantImagesDto {
  @ApiPropertyOptional({
    description: 'Restaurant logo URL (uploaded by frontend)',
  })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'Restaurant cover image URL (uploaded by frontend)',
  })
  @IsOptional()
  @IsString()
  coverImage?: string;
}
