import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContactSubmissionStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { QueryDto } from '../../common/dto';

export class ListContactSubmissionsDto extends QueryDto {
  @ApiPropertyOptional({
    description: 'Super/business admin restaurant filter',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;

  @ApiPropertyOptional({
    description: 'Business admin branch filter. Branch admins are auto-scoped.',
  })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: ContactSubmissionStatus })
  @IsOptional()
  @IsEnum(ContactSubmissionStatus)
  status?: ContactSubmissionStatus;
}

export class UpdateContactSubmissionStatusDto {
  @ApiProperty({ enum: ContactSubmissionStatus })
  @IsEnum(ContactSubmissionStatus)
  status!: ContactSubmissionStatus;
}

export class ReplyContactSubmissionDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  subject?: string;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  message!: string;
}
