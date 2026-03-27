import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { QueryDto } from '../../../common/dto';

export class ListAddressesDto extends QueryDto {
  @ApiPropertyOptional({
    description: 'Target customer id when admin fetches customer addresses',
  })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({
    description:
      'Optional branch scope check for super admin/business admin customer-address lookups',
  })
  @IsOptional()
  @IsString()
  branchId?: string;
}
