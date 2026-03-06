import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AddressRefTypeEnum } from '../../../common/enums';

export class CreateAddressDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  referenceId!: string;

  @ApiProperty({ enum: AddressRefTypeEnum })
  refType!: AddressRefTypeEnum;

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
