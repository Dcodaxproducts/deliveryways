import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  IsEmail,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BranchSettingsDto } from '../../branches/dto/create-branch.dto';

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantBio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantLogoUrl?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  tenantSocialLinks?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  tenantSettings?: Record<string, unknown>;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  restaurantName!: string;

  @ApiPropertyOptional({ description: 'Optional unique slug, auto-generated if missing' })
  @IsOptional()
  @IsString()
  restaurantSlug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantLogoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantTagline?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  restaurantSupportContact?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  restaurantBranding?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  restaurantSocialMedia?: Record<string, unknown>;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  branchName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchCoverImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchDescription?: string;

  @ApiPropertyOptional({ type: BranchSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BranchSettingsDto)
  branchSettings?: BranchSettingsDto;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  street!: string;

  @ApiPropertyOptional({ description: 'Area or sector' })
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
}
