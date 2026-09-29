import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreatePosPrinterAccountDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  password!: string;

  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

  @ApiPropertyOptional({
    description: 'Required for business admins; inferred for branch admins',
  })
  @IsOptional()
  @IsString()
  branchId?: string;
}

export class UpdatePosPrinterStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

export class ResetPosPrinterPasswordDto {
  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  newPassword!: string;
}
