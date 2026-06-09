import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BranchOpeningHourItemDto } from './branch-opening-hours.dto';

export class UpdateBranchDeliveryHoursDto {
  @ApiProperty({ type: BranchOpeningHourItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => BranchOpeningHourItemDto)
  deliveryHours!: BranchOpeningHourItemDto[];
}
