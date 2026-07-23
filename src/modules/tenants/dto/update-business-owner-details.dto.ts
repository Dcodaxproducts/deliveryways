import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UpdateTenantDto } from './update-tenant.dto';

export class UpdateBusinessOwnerAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isApproved?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional({
    description:
      'Optional replacement password. Existing password hashes are never returned.',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class UpdateBusinessOwnerDetailsDto {
  @ApiPropertyOptional({ type: UpdateBusinessOwnerAccountDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateBusinessOwnerAccountDto)
  owner?: UpdateBusinessOwnerAccountDto;

  @ApiPropertyOptional({ type: UpdateTenantDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateTenantDto)
  tenant?: UpdateTenantDto;
}
