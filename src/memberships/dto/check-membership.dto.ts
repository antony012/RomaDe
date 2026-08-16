import { IsNotEmpty, IsString } from 'class-validator';

export class CheckMembershipDto {
  @IsString()
  @IsNotEmpty()
  jwt_token: string;
}
