import { IsNotEmpty, IsString } from 'class-validator';
import { OptionalText } from '../../integrity/dto/optional-text';

export class CheckMembershipDto {
  @IsString()
  @IsNotEmpty()
  jwt_token: string;

  @OptionalText()
  email?: string;

  @OptionalText()
  first_name?: string;

  @OptionalText()
  last_name?: string;

  @OptionalText()
  phone_number?: string;

  @OptionalText()
  dasher_id?: string;
}
