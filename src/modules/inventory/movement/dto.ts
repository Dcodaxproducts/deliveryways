import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { QueryDto } from '../../../common/dto';

export enum StockMovementTypeDto {
  IN = 'IN',
  OUT = 'OUT',
  ADJUST = 'ADJUST',
}

export class CreateInventoryMovementDto {
  @ApiProperty()
  @IsString()
  inventoryItemId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ enum: StockMovementTypeDto })
  @IsEnum(StockMovementTypeDto)
  movementType!: StockMovementTypeDto;

  @ApiProperty()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceId?: string;
}

export class ListInventoryMovementsDto extends QueryDto {
  @ApiProperty()
  @IsString()
  inventoryItemId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;
}
