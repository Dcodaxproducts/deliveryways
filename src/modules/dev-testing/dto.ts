import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserRoleEnum } from '../../common/enums';

export class DevBootstrapStoreDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  baseName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  ownerPassword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  customerPassword?: string;
}

export class DevTestingUserIdentifierDto {
  @ApiPropertyOptional({
    description: 'User id. Provide this or email.',
  })
  @ValidateIf((value) => !value.email)
  @IsString()
  id?: string;

  @ApiPropertyOptional({
    description: 'User email. Provide this or id.',
  })
  @ValidateIf((value) => !value.id)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    enum: UserRoleEnum,
    description: 'Optional role filter when email can match multiple accounts.',
  })
  @IsOptional()
  @IsEnum(UserRoleEnum)
  role?: UserRoleEnum;

  @ApiPropertyOptional({
    description:
      'Optional restaurant scope for customer/branch-admin lookup by email.',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;
}

export class DevTestingLookupAccountsByEmailDto {
  @ApiPropertyOptional({
    description: 'Email address to search across user, staff, and deliveryman accounts.',
  })
  @IsEmail()
  email!: string;
}
