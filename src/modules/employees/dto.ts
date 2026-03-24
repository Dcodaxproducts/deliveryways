import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AdminListQueryDto } from '../../common/dto';

export class EmployeeProfileDto {
  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

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
}

export class CreateEmployeeDto {
  @ApiPropertyOptional({
    description: 'Optional for scoped admins; token restaurant scope is used',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ type: EmployeeProfileDto })
  @ValidateNested()
  @Type(() => EmployeeProfileDto)
  profile!: EmployeeProfileDto;
}

export class UpdateEmployeeProfileDto extends PartialType(EmployeeProfileDto) {}

export class UpdateEmployeeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ type: UpdateEmployeeProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEmployeeProfileDto)
  profile?: UpdateEmployeeProfileDto;
}

export class UpdateEmployeeStatusDto {
  @ApiProperty()
  @Type(() => Boolean)
  @IsBoolean()
  isActive!: boolean;
}

export class ListEmployeesDto extends AdminListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
