import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateMyAvatarDto {
  @ApiProperty({ description: 'Profile avatar URL (uploaded by frontend)' })
  @IsString()
  @IsNotEmpty()
  avatarUrl!: string;
}
