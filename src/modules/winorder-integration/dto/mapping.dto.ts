import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod, WinOrderCatalogMappingType } from '@prisma/client';

export class WinOrderCatalogMappingDto {
  @IsEnum(WinOrderCatalogMappingType)
  mappingType!: WinOrderCatalogMappingType;

  @IsString()
  @MaxLength(512)
  localKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  externalArticleNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalArticleName?: string;
}

export class ReplaceWinOrderCatalogMappingsDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => WinOrderCatalogMappingDto)
  mappings!: WinOrderCatalogMappingDto[];
}

export class WinOrderPaymentMappingDto {
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsString()
  @MaxLength(191)
  externalLabel!: string;
}

export class ReplaceWinOrderPaymentMappingsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => WinOrderPaymentMappingDto)
  mappings!: WinOrderPaymentMappingDto[];
}
