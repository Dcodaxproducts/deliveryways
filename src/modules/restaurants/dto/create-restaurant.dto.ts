import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateRestaurantDto {
  @ApiPropertyOptional({
    description: 'Required when super admin creates a restaurant',
  })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional({
    description: 'Optional custom storefront domain, e.g. orders.example.com',
  })
  @IsOptional()
  @IsString()
  customDomain?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tagline?: string;

  @ApiPropertyOptional({ description: 'Brand bio/description' })
  @IsOptional()
  @IsString()
  bio?: string;

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

  @ApiPropertyOptional({
    type: Object,
    example: {
      primaryColor: '#FF0000',
      secondaryColor: '#000000',
      fontFamily: 'Inter',
    },
  })
  @IsOptional()
  @IsObject()
  branding?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  socialMedia?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
