import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelMembershipDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
