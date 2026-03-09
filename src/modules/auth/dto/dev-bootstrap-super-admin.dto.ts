import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class DevBootstrapSuperAdminDto {
  @ApiPropertyOptional({ example: 'superadmin@deliveryways.dev' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Admin@123456' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
