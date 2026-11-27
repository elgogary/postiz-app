// >>> SANAD-BRANDS: a brand's posts and the review loop. Every method loads the brand with the caller's org first.
import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { orgRoleOf } from '@gitroom/nestjs-libraries/database/prisma/brands/brands.service';
import { ApproveDto, BrandCommentDto, BrandDateDto, SendBackDto } from '@gitroom/nestjs-libraries/dtos/brands/brand.posts.dto';
import { BrandReviewService } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.review.service';

@ApiTags('Brands')
@Controller('/brands')
export class BrandPostsController {
  constructor(private _review: BrandReviewService) {}

  @Get('/:customerId/posts')
  cards(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string) {
    return this._review.cards(org.id, user.id, orgRoleOf(org), customerId);
  }

  @Post('/:customerId/briefs/:briefId/draft')
  createDraft(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string,
    @Param('briefId') briefId: string, @Body() body: BrandDateDto) {
    return this._review.createDraft(org.id, user.id, orgRoleOf(org), customerId, briefId, body);
  }

  @Put('/:customerId/briefs/:briefId/date')
  briefDate(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string,
    @Param('briefId') briefId: string, @Body() body: BrandDateDto) {
    return this._review.briefDate(org.id, user.id, orgRoleOf(org), customerId, briefId, body);
  }

  @Post('/:customerId/briefs/:briefId/unplan')
  unplan(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string,
    @Param('briefId') briefId: string) {
    return this._review.unplan(org.id, user.id, orgRoleOf(org), customerId, briefId);
  }

  @Post('/:customerId/posts/:postId/review')
  review(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string, @Param('postId') postId: string) {
    return this._review.sendForReview(org.id, user.id, orgRoleOf(org), customerId, postId);
  }

  @Post('/:customerId/posts/:postId/approve')
  approve(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string,
    @Param('postId') postId: string, @Body() body: ApproveDto) {
    return this._review.approve(org.id, user.id, orgRoleOf(org), customerId, postId, body);
  }

  @Post('/:customerId/posts/:postId/send-back')
  sendBack(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string,
    @Param('postId') postId: string, @Body() body: SendBackDto) {
    return this._review.sendBack(org.id, user.id, orgRoleOf(org), customerId, postId, body);
  }

  @Post('/:customerId/posts/:postId/stop')
  stop(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string, @Param('postId') postId: string) {
    return this._review.stop(org.id, user.id, orgRoleOf(org), customerId, postId);
  }

  @Post('/:customerId/posts/:postId/schedule')
  schedule(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string, @Param('postId') postId: string) {
    return this._review.schedule(org.id, user.id, orgRoleOf(org), customerId, postId);
  }

  @Put('/:customerId/posts/:postId/date')
  newDate(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string,
    @Param('postId') postId: string, @Body() body: BrandDateDto) {
    return this._review.newDate(org.id, user.id, orgRoleOf(org), customerId, postId, body);
  }

  @Post('/:customerId/posts/:postId/published')
  published(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string, @Param('postId') postId: string) {
    return this._review.markPublished(org.id, user.id, orgRoleOf(org), customerId, postId);
  }

  @Get('/:customerId/posts/:postId/comments')
  comments(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string, @Param('postId') postId: string) {
    return this._review.comments(org.id, user.id, orgRoleOf(org), customerId, postId);
  }

  @Post('/:customerId/posts/:postId/comments')
  addComment(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string,
    @Param('postId') postId: string, @Body() body: BrandCommentDto) {
    return this._review.addComment(org.id, user.id, orgRoleOf(org), customerId, postId, body);
  }
}
// <<< SANAD-BRANDS
