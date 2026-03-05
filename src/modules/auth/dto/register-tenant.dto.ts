import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterTenantDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tenantName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tenantSlug!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  restaurantName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  restaurantSlug!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  branchName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  street!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  state!: string;
}
