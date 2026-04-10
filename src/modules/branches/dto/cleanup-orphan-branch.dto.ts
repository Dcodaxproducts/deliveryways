import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class CleanupOrphanBranchDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'When false, returns a preview only. When true, executes safe orphan cleanup.',
  })
  @IsOptional()
  @IsBoolean()
  execute?: boolean;
}
