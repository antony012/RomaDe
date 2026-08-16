import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

/** JSONObject de la APK omite nulls o manda string; nunca fallar el ValidationPipe. */
export function OptionalText(): PropertyDecorator {
  return (target, propertyKey) => {
    Transform(({ value }) => {
      if (value == null) return undefined;
      const text = String(value).trim();
      return text.length ? text : undefined;
    })(target, propertyKey);
    IsOptional()(target, propertyKey);
    IsString()(target, propertyKey);
  };
}
