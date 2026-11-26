// >>> SANAD-BRANDS: a brand's posts and the review loop. Every method loads the brand with the caller's org first.
import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { orgRoleOf } from '@gitroom/nestjs-libraries/database/prisma/brands/brands.service';
import { BrandReviewService } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.review.service';

@ApiTags('Brands')
@Controller('/brands')
export class BrandPostsController {
  constructor(private _review: BrandReviewService) {}

  @Get('/:customerId/posts')
  cards(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string) {
    return this._review.cards(org.id, user.id, orgRoleOf(org), customerId);
  }
}
// <<< SANAD-BRANDS
