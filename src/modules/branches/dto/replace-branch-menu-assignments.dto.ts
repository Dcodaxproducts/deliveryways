import { ArrayMinSize, ArrayUnique, IsArray, IsString } from 'class-validator';

export class ReplaceBranchMenuAssignmentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  menuIds!: string[];

  @IsString()
  defaultMenuId!: string;
}
