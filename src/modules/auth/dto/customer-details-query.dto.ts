import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CustomerDetailsQueryDto {
  @ApiPropertyOptional({
    description: 'Optional restaurant scope for super admin',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;
}
