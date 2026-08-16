import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateAdminDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
