import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRoleEnum } from '../../../common/enums';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google ID token returned by Google Identity Services',
  })
  @IsString()
  @MinLength(20)
  idToken!: string;

  @ApiPropertyOptional({ enum: UserRoleEnum })
  @IsOptional()
  @IsEnum(UserRoleEnum)
  role?: UserRoleEnum;

  @ApiPropertyOptional({
    description: 'Required when resolving restaurant-scoped customers',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;
}
