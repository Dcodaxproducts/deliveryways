import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const SYSTEM_HEALTH_RANGE_VALUES = ['hour', 'day', 'week'] as const;
export type SystemHealthRange = (typeof SYSTEM_HEALTH_RANGE_VALUES)[number];

export const SYSTEM_HEALTH_INTEGRATION_TYPES = ['webhook', 'printer'] as const;
export type SystemHealthIntegrationType =
  (typeof SYSTEM_HEALTH_INTEGRATION_TYPES)[number];

const toNumber = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Number(value);

export class SystemHealthMetricsQueryDto {
  @ApiPropertyOptional({ enum: SYSTEM_HEALTH_RANGE_VALUES, default: 'hour' })
  @IsOptional()
  @IsIn(SYSTEM_HEALTH_RANGE_VALUES)
  range?: SystemHealthRange;
}

export class SystemHealthLogsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SystemHealthIntegrationLogsQueryDto extends SystemHealthLogsQueryDto {
  @ApiPropertyOptional({
    enum: SYSTEM_HEALTH_INTEGRATION_TYPES,
    default: 'webhook',
  })
  @IsOptional()
  @IsIn(SYSTEM_HEALTH_INTEGRATION_TYPES)
  type?: SystemHealthIntegrationType;
}
