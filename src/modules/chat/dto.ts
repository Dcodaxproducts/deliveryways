import { Type } from 'class-transformer';
import { ChatThreadSource, ChatThreadStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { QueryDto } from '../../common/dto';

export class CreateChatThreadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  subject?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;
}

export class CreateChatMessageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;
}

export class UpdateChatThreadStatusDto {
  @ApiProperty({ enum: ChatThreadStatus })
  @IsEnum(ChatThreadStatus)
  status!: ChatThreadStatus;
}

export class AssignChatThreadDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  assignedStaffUserId?: string | null;
}

export class ListChatThreadsDto extends QueryDto {
  @ApiPropertyOptional({ enum: ChatThreadStatus })
  @IsOptional()
  @IsEnum(ChatThreadStatus)
  status?: ChatThreadStatus;

  @ApiPropertyOptional({ enum: ChatThreadSource })
  @IsOptional()
  @IsEnum(ChatThreadSource)
  source?: ChatThreadSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedStaffUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  unreadOnly?: boolean;
}
