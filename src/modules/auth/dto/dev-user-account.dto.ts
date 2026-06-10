import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRoleEnum } from '../../../common/enums';

export class DevUserLookupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional({ enum: UserRoleEnum })
  @IsOptional()
  @IsEnum(UserRoleEnum)
  role?: UserRoleEnum;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeDeleted?: boolean;
}

export class DevUserUpdateDto extends DevUserLookupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  newEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isApproved?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class DevUserDeleteDto extends DevUserLookupDto {
  @ApiPropertyOptional({
    default: false,
    description: 'Hard-delete the matched user instead of scheduling deletion',
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
