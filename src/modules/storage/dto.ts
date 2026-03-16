import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreatePresignedUploadUrlDto {
  @ApiProperty({
    description: 'Original file name from frontend',
    example: 'burger-banner.png',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({
    description: 'MIME type that frontend will upload',
    example: 'image/png',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  contentType!: string;

  @ApiPropertyOptional({
    description: 'Optional folder/prefix inside the bucket',
    example: 'menu-items',
  })
  @IsOptional()
  @Transform(({ value }): string | undefined => {
    if (typeof value !== 'string') {
      return undefined;
    }

    return value.trim().replace(/^\/+|\/+$/g, '');
  })
  @IsString()
  @Matches(/^[a-zA-Z0-9/_-]+$/, {
    message:
      'folder can only contain letters, numbers, slashes, underscores, and hyphens',
  })
  folder?: string;
}
