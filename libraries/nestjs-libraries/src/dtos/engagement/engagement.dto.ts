import { IsDefined, IsIn, IsOptional, IsString, IsUrl } from 'class-validator';

// tier + status are plain strings enforced via @IsIn (Postiz convention: avoid Prisma enums to keep rebases clean).

export class EngagementTargetDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsDefined()
  name: string;

  @IsString()
  @IsUrl()
  @IsDefined()
  linkedinUrl: string;

  @IsOptional()
  @IsString()
  headline?: string;

  @IsOptional()
  @IsString()
  @IsIn(['A', 'B', 'C'])
  tier?: string;
}

export class ManualDraftDto {
  @IsString()
  @IsDefined()
  targetId: string;

  @IsString()
  @IsDefined()
  postText: string;

  @IsOptional()
  @IsString()
  postUrl?: string;
}

export class UpdateDraftDto {
  @IsOptional()
  @IsString()
  draftText?: string;

  @IsOptional()
  @IsString()
  @IsIn(['pending', 'approved', 'posted', 'skipped'])
  status?: string;
}
