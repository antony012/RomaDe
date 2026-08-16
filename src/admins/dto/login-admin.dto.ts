import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginAdminDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  password: string;
}
