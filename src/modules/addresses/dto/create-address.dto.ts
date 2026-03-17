import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAddressDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  street!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  area?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  state!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  country!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lat?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lng?: string;
}
