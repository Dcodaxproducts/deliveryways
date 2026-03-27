import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum BranchScheduleDayEnum {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
}

const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class BranchOpeningHourItemDto {
  @ApiProperty({ enum: BranchScheduleDayEnum })
  @IsEnum(BranchScheduleDayEnum)
  dayOfWeek!: BranchScheduleDayEnum;

  @ApiProperty()
  @IsBoolean()
  isClosed!: boolean;

  @ApiProperty({ required: false, example: '09:00', nullable: true })
  @ValidateIf((o: BranchOpeningHourItemDto) => !o.isClosed)
  @IsString()
  @Matches(TIME_24H_REGEX, { message: 'openTime must be in HH:mm format' })
  openTime?: string | null;

  @ApiProperty({ required: false, example: '22:00', nullable: true })
  @ValidateIf((o: BranchOpeningHourItemDto) => !o.isClosed)
  @IsString()
  @Matches(TIME_24H_REGEX, { message: 'closeTime must be in HH:mm format' })
  closeTime?: string | null;

  @ApiProperty({
    required: false,
    example: 'Break 14:00-15:00',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  note?: string | null;
}

export class UpdateBranchOpeningHoursDto {
  @ApiProperty({ type: BranchOpeningHourItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => BranchOpeningHourItemDto)
  openingHours!: BranchOpeningHourItemDto[];
}
