import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import {
  CUSTOMER_APP_FAQ_CATEGORY_VALUES,
  CUSTOMER_APP_FAQ_STATUS_VALUES,
  CUSTOMER_APP_FAQ_VISIBILITY_VALUES,
} from '../../../common/utils';

export class RestaurantCustomerAppFaqDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  question?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_APP_FAQ_CATEGORY_VALUES })
  @IsOptional()
  @IsIn(CUSTOMER_APP_FAQ_CATEGORY_VALUES)
  category?: (typeof CUSTOMER_APP_FAQ_CATEGORY_VALUES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  answer?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_APP_FAQ_STATUS_VALUES })
  @IsOptional()
  @IsIn(CUSTOMER_APP_FAQ_STATUS_VALUES)
  status?: 'DRAFT' | 'PUBLISHED';

  @ApiPropertyOptional({ enum: CUSTOMER_APP_FAQ_VISIBILITY_VALUES })
  @IsOptional()
  @IsIn(CUSTOMER_APP_FAQ_VISIBILITY_VALUES)
  visibility?: 'PUBLIC' | 'AUTHENTICATED';
}

export class CreateRestaurantCustomerAppFaqDto {
  @ApiProperty()
  @IsString()
  question!: string;

  @ApiProperty({ enum: CUSTOMER_APP_FAQ_CATEGORY_VALUES })
  @IsIn(CUSTOMER_APP_FAQ_CATEGORY_VALUES)
  category!: (typeof CUSTOMER_APP_FAQ_CATEGORY_VALUES)[number];

  @ApiProperty()
  @IsString()
  answer!: string;

  @ApiPropertyOptional({ enum: CUSTOMER_APP_FAQ_STATUS_VALUES })
  @IsOptional()
  @IsIn(CUSTOMER_APP_FAQ_STATUS_VALUES)
  status?: 'DRAFT' | 'PUBLISHED';

  @ApiPropertyOptional({ enum: CUSTOMER_APP_FAQ_VISIBILITY_VALUES })
  @IsOptional()
  @IsIn(CUSTOMER_APP_FAQ_VISIBILITY_VALUES)
  visibility?: 'PUBLIC' | 'AUTHENTICATED';
}

export class UpdateRestaurantCustomerAppFaqDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  question?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_APP_FAQ_CATEGORY_VALUES })
  @IsOptional()
  @IsIn(CUSTOMER_APP_FAQ_CATEGORY_VALUES)
  category?: (typeof CUSTOMER_APP_FAQ_CATEGORY_VALUES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  answer?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_APP_FAQ_STATUS_VALUES })
  @IsOptional()
  @IsIn(CUSTOMER_APP_FAQ_STATUS_VALUES)
  status?: 'DRAFT' | 'PUBLISHED';

  @ApiPropertyOptional({ enum: CUSTOMER_APP_FAQ_VISIBILITY_VALUES })
  @IsOptional()
  @IsIn(CUSTOMER_APP_FAQ_VISIBILITY_VALUES)
  visibility?: 'PUBLIC' | 'AUTHENTICATED';
}
