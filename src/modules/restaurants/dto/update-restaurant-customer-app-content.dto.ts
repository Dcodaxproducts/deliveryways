import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CustomerAppFaqDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  question?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  answer?: string;
}

export class UpdateRestaurantCustomerAppContentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  privacyPolicy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  helpSupport?: string;

  @ApiPropertyOptional({ type: [CustomerAppFaqDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomerAppFaqDto)
  faqs?: CustomerAppFaqDto[];

  @ApiPropertyOptional({
    type: Object,
    example: {
      email: 'support@brand.com',
      whatsapp: '+923001234567',
      phone: '+923001234567',
    },
  })
  @IsOptional()
  @IsObject()
  supportContact?: Record<string, unknown>;
}
