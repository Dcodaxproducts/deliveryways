import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { QueryDto } from '../../common/dto';
import { LOCALIZATION_ENTITY_TYPES } from './localization.constants';

class TranslationFieldsDto {
  [key: string]: unknown;
}

export class UpsertEntityTranslationDto {
  @ApiPropertyOptional({
    description:
      'Required for super admin; resolved from token for scoped admins',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiProperty({
    description: 'Translated display fields for the target entity',
    example: { name: 'Translated name', description: 'Translated description' },
  })
  @IsObject()
  @ValidateNested()
  @Type(() => TranslationFieldsDto)
  fields!: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListEntityTranslationsDto extends QueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional({ enum: LOCALIZATION_ENTITY_TYPES })
  @IsOptional()
  @IsIn(LOCALIZATION_ENTITY_TYPES)
  entityType?: (typeof LOCALIZATION_ENTITY_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;
}
