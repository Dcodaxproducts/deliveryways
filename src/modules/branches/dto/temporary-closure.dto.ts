import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional, IsString } from 'class-validator';

export class UpdateBranchTemporaryClosureDto {
  @ApiPropertyOptional({
    description: 'Set true to close temporarily, false to reopen immediately',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;

  @ApiPropertyOptional({
    description:
      'Optional ISO timestamp when branch should reopen automatically',
    example: '2026-04-28T13:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  closedUntil?: string;

  @ApiPropertyOptional({ example: 'Kitchen maintenance' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    example: 'Branch is temporarily closed. Please try again later.',
  })
  @IsOptional()
  @IsString()
  message?: string;
}
