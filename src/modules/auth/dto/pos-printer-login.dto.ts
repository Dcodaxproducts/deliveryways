import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const normalizeIdentifier = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class PosPrinterLoginDto {
  @ApiPropertyOptional({
    description: 'POS printer username or legacy account email',
    example: 'kitchen-printer-1',
  })
  @Transform(normalizeIdentifier)
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  identifier?: string;

  @ApiPropertyOptional({
    description: 'Native printer username or legacy account email',
    example: 'kitchen-printer-1',
  })
  @Transform(normalizeIdentifier)
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  usernameOrEmail?: string;

  @ApiPropertyOptional({ description: 'Legacy printer account email' })
  @Transform(normalizeIdentifier)
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;
}
