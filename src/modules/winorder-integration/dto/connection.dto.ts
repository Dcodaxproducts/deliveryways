import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateWinOrderConnectionDto {
  @IsString()
  branchId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  storeId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  storeName?: string;
}

export class UpdateWinOrderConnectionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  storeId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  storeName?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class WinOrderStoreRouteDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  storeId?: number;
}
