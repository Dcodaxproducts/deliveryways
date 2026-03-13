import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, ArrayUnique, IsArray, IsEmail } from 'class-validator';

export class ForceDeleteUsersDto {
  @ApiProperty({
    type: [String],
    example: ['customer1@example.com', 'customer2@example.com'],
    description: 'Email addresses of users to delete permanently',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEmail({}, { each: true })
  emails!: string[];
}
