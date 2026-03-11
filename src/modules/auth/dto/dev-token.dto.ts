import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { UserRoleEnum } from '../../../common/enums';

export class DevTokenDto {
  @ApiPropertyOptional({
    enum: UserRoleEnum,
    default: UserRoleEnum.SUPER_ADMIN,
  })
  @IsOptional()
  role?: UserRoleEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  uid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bid?: string;
}
