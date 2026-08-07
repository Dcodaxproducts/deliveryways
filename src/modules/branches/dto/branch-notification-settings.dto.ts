import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, ValidateIf } from 'class-validator';

export class UpdateBranchNotificationSettingsDto {
  @ApiPropertyOptional({ example: 'orders@restaurant.de' })
  @IsOptional()
  @ValidateIf((dto: UpdateBranchNotificationSettingsDto) =>
    Boolean(dto.enabled || dto.emailAddress),
  )
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  emailAddress?: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
