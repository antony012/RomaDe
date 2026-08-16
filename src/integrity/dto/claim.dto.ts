import { OptionalText } from './optional-text';

export class ClaimDto {
  @OptionalText()
  jwt_token?: string;

  @OptionalText()
  user_id?: string;
}
