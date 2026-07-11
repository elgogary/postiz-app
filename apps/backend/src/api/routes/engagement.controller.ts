import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { EngagementService } from '@gitroom/nestjs-libraries/database/prisma/engagement/engagement.service';
import {
  EngagementTargetDto,
  ManualDraftDto,
  UpdateDraftDto,
} from '@gitroom/nestjs-libraries/dtos/engagement/engagement.dto';

@ApiTags('Engagement')
@Controller('/engagement')
export class EngagementController {
  constructor(private _engagementService: EngagementService) {}

  @Get('/targets')
  targets(@GetOrgFromRequest() org: Organization) {
    return this._engagementService.getTargets(org.id);
  }

  @Post('/targets')
  upsertTarget(
    @GetOrgFromRequest() org: Organization,
    @Body() body: EngagementTargetDto
  ) {
    return this._engagementService.upsertTarget(org.id, body);
  }

  @Delete('/targets/:id')
  deleteTarget(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._engagementService.deleteTarget(org.id, id);
  }

  @Post('/targets/:id/pull')
  pull(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._engagementService.pullTarget(org.id, id);
  }

  // >>> SANAD-ENGAGEMENT (my analytics)
  @Post('/my-analytics')
  myAnalytics(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { linkedinUrl: string; maxPosts?: number }
  ) {
    return this._engagementService.myLinkedInAnalytics(
      body.linkedinUrl,
      body.maxPosts
    );
  }
  // <<< SANAD-ENGAGEMENT (my analytics)

  // >>> SANAD-ENGAGEMENT (idea bank UI)
  @Get('/content-ideas')
  contentIdeas(@GetOrgFromRequest() org: Organization) {
    return this._engagementService.listContentIdeas(org.id);
  }

  @Post('/content-ideas')
  createContentIdea(
    @GetOrgFromRequest() org: Organization,
    @Body()
    body: { idea: string; note?: string; source?: string; tags?: string[] }
  ) {
    return this._engagementService.addContentIdea(
      org.id,
      body.idea,
      body.note,
      body.source,
      body.tags
    );
  }

  @Delete('/content-ideas/:id')
  deleteContentIdea(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._engagementService.deleteContentIdea(org.id, id);
  }
  // <<< SANAD-ENGAGEMENT (idea bank UI)

  @Get('/queue')
  queue(
    @GetOrgFromRequest() org: Organization,
    @Query('status') status?: string
  ) {
    return this._engagementService.getQueue(org.id, status);
  }

  @Get('/health')
  health(@GetOrgFromRequest() org: Organization) {
    return this._engagementService.getHealth(org.id);
  }

  @Post('/drafts')
  createManualDraft(
    @GetOrgFromRequest() org: Organization,
    @Body() body: ManualDraftDto
  ) {
    return this._engagementService.createManualDraft(
      org.id,
      body.targetId,
      body.postText,
      body.postUrl
    );
  }

  @Post('/drafts/:id/generate')
  generate(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._engagementService.generateDraft(org.id, id);
  }

  @Put('/drafts/:id')
  editDraft(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdateDraftDto
  ) {
    return this._engagementService.editDraft(org.id, id, body);
  }

  @Post('/drafts/:id/posted')
  markPosted(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._engagementService.markPosted(org.id, id);
  }

  @Delete('/drafts/:id')
  deleteDraft(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._engagementService.deleteDraft(org.id, id);
  }
}
