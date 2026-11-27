import { IsDefined, IsOptional, IsString } from 'class-validator';

export class TokenExchangeDto {
  @IsString()
  @IsDefined()
  grant_type: string;

  @IsString()
  @IsDefined()
  code: string;

  // SANAD-BRANDS: optional here, because a client may send them in the Authorization header instead (client_secret_basic)
  @IsOptional()
  @IsString()
  client_id?: string;

  @IsOptional()
  @IsString()
  client_secret?: string;
}
