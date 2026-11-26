// >>> SANAD-BRANDS
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveSectionDto {
  @IsOptional() @IsString() @MaxLength(100000) content?: string;
  @IsOptional() @IsArray() rows?: string[][];
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class SetAccessDto {
  @IsString() userId: string;
  @IsIn(['VIEW', 'CREATE', 'APPROVE']) role: 'VIEW' | 'CREATE' | 'APPROVE';
}

export class SetSettingsDto {
  @IsBoolean() requiresApproval: boolean;
}

export class ImportPlanDto {
  @IsString() @MaxLength(2000000) html: string;
  @IsBoolean() dryRun: boolean;
}
// <<< SANAD-BRANDS
