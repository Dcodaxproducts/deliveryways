import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BranchSettingsDto,
  CreateBranchAdminDto,
} from '../../branches/dto/create-branch.dto';

export class RegisterOwnerDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;
}

export class RegisterTenantInfoDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class RegisterRestaurantInfoDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional({
    description: 'Optional custom domain e.g. orders.kfc.com.pk',
  })
  @IsOptional()
  @IsString()
  customDomain?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tagline?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  supportContact?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  branding?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  socialMedia?: Record<string, unknown>;
}

export class RegisterBranchInfoDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: BranchSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BranchSettingsDto)
  settings?: BranchSettingsDto;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  street!: string;

  @ApiPropertyOptional({ description: 'Branch shop number' })
  @IsOptional()
  @IsString()
  shopNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiPropertyOptional({
    description: 'Legacy second address line. Prefer shopNumber.',
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

  @ApiProperty({
    description: 'Latitude coordinate for the main branch address',
  })
  @IsString()
  @IsNotEmpty()
  @IsLatitude()
  lat!: string;

  @ApiProperty({
    description: 'Longitude coordinate for the main branch address',
  })
  @IsString()
  @IsNotEmpty()
  @IsLongitude()
  lng!: string;
}

export class RegisterTenantDto {
  @ApiProperty({
    description: 'Selected active package plan for business owner onboarding',
  })
  @IsString()
  @IsNotEmpty()
  packagePlanId!: string;

  @ApiProperty({ type: RegisterOwnerDto })
  @ValidateNested()
  @Type(() => RegisterOwnerDto)
  user!: RegisterOwnerDto;

  @ApiPropertyOptional({
    type: CreateBranchAdminDto,
    description:
      'Optional branch admin account for the main branch. If password is omitted, backend generates one.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateBranchAdminDto)
  branchAdmin?: CreateBranchAdminDto;

  @ApiProperty({ type: RegisterTenantInfoDto })
  @ValidateNested()
  @Type(() => RegisterTenantInfoDto)
  tenant!: RegisterTenantInfoDto;

  @ApiProperty({ type: RegisterRestaurantInfoDto })
  @ValidateNested()
  @Type(() => RegisterRestaurantInfoDto)
  restaurant!: RegisterRestaurantInfoDto;

  @ApiProperty({ type: RegisterBranchInfoDto })
  @ValidateNested()
  @Type(() => RegisterBranchInfoDto)
  branch!: RegisterBranchInfoDto;
}
