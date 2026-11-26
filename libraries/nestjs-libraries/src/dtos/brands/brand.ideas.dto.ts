// >>> SANAD-BRANDS
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsObject, IsOptional, IsString, MaxLength,
} from 'class-validator';

export class IdeaDto {
  @IsString() @MaxLength(500) hook: string;
  @IsOptional() @IsString() @MaxLength(2000) angle?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) bullets?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) brandIds?: string[];
  @IsOptional() @IsString() @MaxLength(100) topic?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) pillars?: string[];
  @IsOptional() @IsString() @MaxLength(20) format?: string;
  @IsOptional() @IsString() @MaxLength(500) source?: string;
}

export class IdeaStatusDto {
  @IsIn(['DROPPED', 'NEW']) status: 'DROPPED' | 'NEW';
}

export class MigrateIdeasDto {
  @IsBoolean() dryRun: boolean;
  @IsOptional() @IsObject() tagMap?: Record<string, string>;
}

export class PlanIdeaDto {
  @IsString() customerId: string;
  @IsDateString() date: string;
  @IsIn(['Text', 'Carousel', 'Image', 'Video', 'Poll']) format: 'Text' | 'Carousel' | 'Image' | 'Video' | 'Poll';
  @IsBoolean() ai: boolean;
}
// <<< SANAD-BRANDS
