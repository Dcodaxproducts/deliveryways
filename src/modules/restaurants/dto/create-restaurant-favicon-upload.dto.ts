import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

const MAX_FAVICON_UPLOAD_BYTES = 20 * 1024 * 1024;

export class CreateRestaurantFaviconUploadDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty({ example: 'image/webp' })
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_FAVICON_UPLOAD_BYTES })
  @IsInt()
  @Min(1)
  @Max(MAX_FAVICON_UPLOAD_BYTES)
  fileSize!: number;
}
