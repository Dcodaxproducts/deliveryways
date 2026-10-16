import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  AnalyticsComparison,
  AnalyticsIntent,
  AnalyticsPeriodPreset,
} from '../domain/analytics-copilot.types';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIMEZONE_PATTERN = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$|^UTC$/;

export class AnalyticsCapabilitiesQueryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(191)
  restaurantId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(191)
  branchId?: string;
}

export class AnalyticsCopilotQueryDto extends AnalyticsCapabilitiesQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  requestId!: string;

  @ApiProperty({ enum: AnalyticsIntent })
  @IsEnum(AnalyticsIntent)
  intent!: AnalyticsIntent;

  @ApiProperty({ enum: AnalyticsPeriodPreset })
  @IsEnum(AnalyticsPeriodPreset)
  period!: AnalyticsPeriodPreset;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @ValidateIf(
    (dto: AnalyticsCopilotQueryDto) =>
      dto.period === AnalyticsPeriodPreset.CUSTOM,
  )
  @Matches(DATE_ONLY_PATTERN)
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-10-16' })
  @ValidateIf(
    (dto: AnalyticsCopilotQueryDto) =>
      dto.period === AnalyticsPeriodPreset.CUSTOM,
  )
  @Matches(DATE_ONLY_PATTERN)
  toDate?: string;

  @ApiPropertyOptional({
    enum: AnalyticsComparison,
    default: AnalyticsComparison.NONE,
  })
  @IsOptional()
  @IsEnum(AnalyticsComparison)
  comparison: AnalyticsComparison = AnalyticsComparison.NONE;

  @ApiPropertyOptional({ default: 'UTC' })
  @IsOptional()
  @Matches(TIMEZONE_PATTERN)
  @MaxLength(64)
  timezone = 'UTC';

  @ApiPropertyOptional({ enum: ['en', 'de'], default: 'en' })
  @IsOptional()
  @IsIn(['en', 'de'])
  locale: 'en' | 'de' = 'en';

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  question?: string;
}
