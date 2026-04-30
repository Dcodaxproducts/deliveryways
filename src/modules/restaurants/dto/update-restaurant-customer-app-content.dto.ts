import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RestaurantCustomerAppFaqDto } from './customer-app-faq.dto';

export class UpdateRestaurantCustomerAppContentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  privacyPolicy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  helpSupport?: string;

  @ApiPropertyOptional({
    description: 'Restaurant-level allergens PDF URL shown on menu items',
  })
  @IsOptional()
  @IsString()
  allergenPdfUrl?: string;

  @ApiPropertyOptional({ type: [RestaurantCustomerAppFaqDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RestaurantCustomerAppFaqDto)
  faqs?: RestaurantCustomerAppFaqDto[];

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
