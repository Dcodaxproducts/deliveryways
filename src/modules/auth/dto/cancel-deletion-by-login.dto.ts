import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRoleEnum } from '../../../common/enums';

export class CancelDeletionByLoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    required: false,
    description:
      'Required for customer accounts when login is restaurant-scoped',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiProperty({
    required: false,
    enum: UserRoleEnum,
    description:
      'Optional account role used when the same email belongs to multiple accounts',
  })
  @IsOptional()
  @IsEnum(UserRoleEnum)
  role?: UserRoleEnum;
}
