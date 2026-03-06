import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { QueryDto } from './query.dto';

export class AdminListQueryDto extends QueryDto {
  @ApiPropertyOptional({
    description: 'Super admin only. Include soft-deleted records.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  withDeleted?: boolean;

  @ApiPropertyOptional({
    description: 'Admin only. Include inactive records.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean;
}
