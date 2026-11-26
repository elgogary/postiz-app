// >>> SANAD-BRANDS
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class BrandDateDto {
  @IsDateString() date: string;
}

export class ApproveDto {
  @IsBoolean() own: boolean;
  @IsBoolean() list: boolean;
}

export class SendBackDto {
  @IsString() @MinLength(1) @MaxLength(2000) reason: string;
}

export class BrandCommentDto {
  @IsString() @MinLength(1) @MaxLength(4000) content: string;
  @IsOptional() @IsInt() @Min(1) @Max(50) slide?: number;
}
// <<< SANAD-BRANDS
