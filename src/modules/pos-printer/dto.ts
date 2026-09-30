import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
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
  @ApiProperty({ example: 'kitchen-printer-1' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-z0-9][a-z0-9._-]*$/)
  username!: string;

  @ApiProperty({ example: 'Kitchen Printer' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;

  @ApiPropertyOptional({
    description: 'Legacy email alias; username is preferred',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

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
