import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRoleEnum } from '../../../common/enums';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const trimLowerString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CheckEmailRoleDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => trimLowerString(value))
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: UserRoleEnum })
  @IsEnum(UserRoleEnum)
  role!: UserRoleEnum;

  @ApiPropertyOptional({
    description: 'Optional restaurant scope for restaurant-scoped accounts',
  })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsOptional()
  @IsString()
  restaurantId?: string;
}
