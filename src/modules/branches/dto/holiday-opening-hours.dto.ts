import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class BranchHolidayOpeningHourItemDto {
  @ApiPropertyOptional({
    example: '2026-12-25',
    description: 'Single holiday date. Use fromDate/toDate for a date range.',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: 'date must be in YYYY-MM-DD format' })
  date?: string;

  @ApiPropertyOptional({ example: '2026-12-25' })
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX, {
    message: 'fromDate must be in YYYY-MM-DD format',
  })
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-12-27' })
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: 'toDate must be in YYYY-MM-DD format' })
  toDate?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isClosed!: boolean;

  @ApiPropertyOptional({ example: '10:00', nullable: true })
  @ValidateIf((o: BranchHolidayOpeningHourItemDto) => !o.isClosed)
  @IsString()
  @Matches(TIME_24H_REGEX, { message: 'openTime must be in HH:mm format' })
  openTime?: string | null;

  @ApiPropertyOptional({ example: '18:00', nullable: true })
  @ValidateIf((o: BranchHolidayOpeningHourItemDto) => !o.isClosed)
  @IsString()
  @Matches(TIME_24H_REGEX, { message: 'closeTime must be in HH:mm format' })
  closeTime?: string | null;

  @ApiPropertyOptional({ example: 'Eid holiday', nullable: true })
  @IsOptional()
  @IsString()
  note?: string | null;
}

export class UpdateBranchHolidayOpeningHoursDto {
  @ApiProperty({ type: BranchHolidayOpeningHourItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => BranchHolidayOpeningHourItemDto)
  holidayOpeningHours!: BranchHolidayOpeningHourItemDto[];
}
