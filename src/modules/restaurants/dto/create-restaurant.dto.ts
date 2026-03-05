import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateRestaurantDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Unique slug for subdomain/URL routing' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional()
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
