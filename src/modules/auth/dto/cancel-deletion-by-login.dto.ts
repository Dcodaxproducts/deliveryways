import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CancelDeletionByLoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    required: false,
    description:
      'Required for customer accounts when login is restaurant-scoped',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;
}
