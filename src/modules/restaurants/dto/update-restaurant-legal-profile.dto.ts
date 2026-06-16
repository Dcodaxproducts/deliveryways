import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateRestaurantLegalProfileDto {
  @ApiPropertyOptional({ example: 'Ali Khan' })
  @IsOptional()
  @IsString()
  ownerName?: string;

  @ApiPropertyOptional({ example: 'DeliveryWays Kitchen LLC' })
  @IsOptional()
  @IsString()
  legalBusinessName?: string;

  @ApiPropertyOptional({ example: 'VAT-123456789' })
  @IsOptional()
  @IsString()
  taxNumber?: string;

  @ApiPropertyOptional({
    type: Object,
    example: {
      street: 'Street 12',
      shopNumber: 'Shop 4',
      postalCode: '54000',
      city: 'Lahore',
      state: 'Punjab',
      country: 'Pakistan',
    },
  })
  @IsOptional()
  @IsObject()
  businessAddress?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Restaurant contract text shown with privacy/legal content',
  })
  @IsOptional()
  @IsString()
  contractText?: string;
}
