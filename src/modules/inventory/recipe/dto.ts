import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { QueryDto } from '../../../common/dto';

export class CreateRecipeDto {
  @ApiProperty()
  @IsString()
  menuItemId!: string;

  @ApiProperty()
  @IsString()
  inventoryItemId!: string;

  @ApiProperty()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  quantity!: number;
}

export class ListRecipesDto extends QueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  menuItemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inventoryItemId?: string;
}
