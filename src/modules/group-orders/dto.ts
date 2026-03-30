import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GroupOrderStatus, OrderType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { QueryDto } from '../../common/dto';
import { OrderTypeEnum, PaymentMethodEnum } from '../../common/enums';

export class GroupOrderItemModifierDto {
  @ApiProperty()
  @IsString()
  modifierId!: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class CreateGroupOrderSessionDto {
  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty({ enum: OrderTypeEnum })
  @IsEnum(OrderTypeEnum)
  orderType!: OrderType;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  deliveryAddressId?: string | null;

  @ApiPropertyOptional({ example: '2026-03-30T20:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  orderTime?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  hostNote?: string | null;
}

export class UpdateGroupOrderSessionDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  deliveryAddressId?: string | null;

  @ApiPropertyOptional({ example: '2026-03-30T20:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  orderTime?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  hostNote?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  couponCode?: string | null;
}

export class JoinGroupOrderDto {
  @ApiProperty()
  @IsString()
  inviteCode!: string;
}

export class AddGroupOrderItemDto {
  @ApiProperty()
  @IsString()
  menuItemId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  variationId?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ type: [GroupOrderItemModifierDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GroupOrderItemModifierDto)
  modifiers?: GroupOrderItemModifierDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateGroupOrderItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  variationId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ type: [GroupOrderItemModifierDto], nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GroupOrderItemModifierDto)
  modifiers?: GroupOrderItemModifierDto[] | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  note?: string | null;
}

export class UpdateGroupOrderStatusDto {
  @ApiProperty({
    enum: [
      GroupOrderStatus.OPEN,
      GroupOrderStatus.LOCKED,
      GroupOrderStatus.CANCELLED,
    ],
  })
  @IsEnum(GroupOrderStatus)
  status!: GroupOrderStatus;
}

export class CheckoutGroupOrderDto {
  @ApiProperty({ enum: PaymentMethodEnum })
  @IsEnum(PaymentMethodEnum)
  paymentMethod!: PaymentMethodEnum;

  @ApiPropertyOptional({ example: '2026-03-30T20:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  orderTime?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  customerNote?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  couponCode?: string | null;
}

export class ListGroupOrdersDto extends QueryDto {
  @ApiPropertyOptional({ enum: GroupOrderStatus })
  @IsOptional()
  @IsEnum(GroupOrderStatus)
  status?: GroupOrderStatus;
}
