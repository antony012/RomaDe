import { OptionalText } from './optional-text';

export class DashEventDto {
  @OptionalText()
  jwt_token?: string;

  @OptionalText()
  event?: string;

  @OptionalText()
  dash_id?: string;

  @OptionalText()
  dasher_id?: string;

  @OptionalText()
  vehicle_id?: string;

  @OptionalText()
  zone_id?: string;

  @OptionalText()
  zone_name?: string;

  @OptionalText()
  scheduled_start_time?: string;

  @OptionalText()
  scheduled_end_time?: string;
}
