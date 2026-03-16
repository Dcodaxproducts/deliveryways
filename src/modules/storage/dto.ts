import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export enum StorageFolderEnum {
  MENU_ITEMS = 'menu-items',
  RESTAURANT_LOGOS = 'restaurant-logos',
  BRANCH_COVERS = 'branch-covers',
  AVATARS = 'avatars',
}

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

  @ApiProperty({
    description: 'Allowed bucket folder/prefix',
    enum: StorageFolderEnum,
    example: StorageFolderEnum.MENU_ITEMS,
  })
  @Transform(({ value }): string | undefined => {
    if (typeof value !== 'string') {
      return undefined;
    }

    return value.trim().replace(/^\/+|\/+$/g, '');
  })
  @IsEnum(StorageFolderEnum)
  folder!: StorageFolderEnum;
}

export class CreatePresignedViewUrlDto {
  @ApiPropertyOptional({
    description: 'Stored object key inside bucket',
    example: 'menu-items/tenant-1/restaurant-1/2026-03-16/file.png',
  })
  @ValidateIf((dto: CreatePresignedViewUrlDto) => !dto.fileUrl)
  @IsString()
  @IsNotEmpty()
  key?: string;

  @ApiPropertyOptional({
    description: 'Public file URL previously returned by storage upload API',
    example:
      'https://deliveryway.s3.eu-west-2.amazonaws.com/menu-items/tenant-1/restaurant-1/2026-03-16/file.png',
  })
  @ValidateIf((dto: CreatePresignedViewUrlDto) => !dto.key)
  @IsString()
  @IsNotEmpty()
  fileUrl?: string;

  @ApiPropertyOptional({
    description: 'Signed GET URL expiry in seconds',
    example: 300,
    minimum: 60,
    maximum: 3600,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(60)
  @Max(3600)
  expiresIn?: number;
}

export class DeleteStoredFileDto {
  @ApiPropertyOptional({
    description: 'Stored object key inside bucket',
    example: 'avatars/tenant-1/user-1/2026-03-16/file.png',
  })
  @ValidateIf((dto: DeleteStoredFileDto) => !dto.fileUrl)
  @IsString()
  @IsNotEmpty()
  key?: string;

  @ApiPropertyOptional({
    description: 'Public file URL previously returned by storage upload API',
    example:
      'https://deliveryway.s3.eu-west-2.amazonaws.com/avatars/tenant-1/user-1/2026-03-16/file.png',
  })
  @ValidateIf((dto: DeleteStoredFileDto) => !dto.key)
  @IsString()
  @IsNotEmpty()
  fileUrl?: string;
}
