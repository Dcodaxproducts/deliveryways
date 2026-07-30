import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAddressDto {
  @ApiPropertyOptional({
    description: 'Target customer id when an admin creates a POS address',
  })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Optional branch scope for admin POS address creation',
  })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  street!: string;

  @ApiPropertyOptional({ description: 'Customer house number' })
  @IsOptional()
  @IsString()
  houseNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiPropertyOptional({
    description: 'Legacy second address line. Prefer houseNumber.',
  })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  state!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  country!: string;

  @ApiProperty({ description: 'Latitude coordinate for this address' })
  @IsString()
  @IsNotEmpty()
  @IsLatitude()
  lat!: string;

  @ApiProperty({ description: 'Longitude coordinate for this address' })
  @IsString()
  @IsNotEmpty()
  @IsLongitude()
  lng!: string;

  @ApiPropertyOptional({
    description: 'Marks this address as the default customer address',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isDefault?: boolean;
}
