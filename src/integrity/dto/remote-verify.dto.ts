import { OptionalText } from './optional-text';

export class RemoteVerifyDto {
  @OptionalText()
  jwt_token?: string;

  @OptionalText()
  email?: string;

  @OptionalText()
  dasher_id?: string;

  @OptionalText()
  first_name?: string;

  @OptionalText()
  last_name?: string;

  @OptionalText()
  phone_number?: string;

  @OptionalText()
  status?: string;

  @OptionalText()
  applicant_id?: string;

  @OptionalText()
  applicant_unique_link?: string;

  @OptionalText()
  inquiry_id?: string;

  @OptionalText()
  persona_session_token?: string;

  @OptionalText()
  device_id?: string;

  @OptionalText()
  template_id?: string;
}
