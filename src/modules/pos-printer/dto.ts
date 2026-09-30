import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePosPrinterAccountDto {
  @ApiPropertyOptional({
    description: 'Legacy email login (optional when username is supplied)',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Globally unique device username' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{3,64}$/)
  username?: string;

  @ApiPropertyOptional({ description: 'Human-readable printer/device name' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  displayName?: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  password!: string;

  @ApiPropertyOptional({ description: 'Legacy name field' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Legacy name field' })
  @IsOptional()
  @IsString()
  lastName?: string;

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
