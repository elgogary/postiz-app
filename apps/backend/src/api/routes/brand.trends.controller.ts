// >>> SANAD-BRANDS: weekly trends live under /brand-trends (same reason as /brand-ideas).
import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { orgRoleOf } from '@gitroom/nestjs-libraries/database/prisma/brands/brands.service';
import { BrandTrendsService } from '@gitroom/nestjs-libraries/database/prisma/brands/trends/brand.trends.service';
import { isOrgAdmin } from '@gitroom/helpers/brands/brand.rules';

import { TREND_ID, isTrendScope } from '@gitroom/backend/api/routes/brand.trends.scope';

function parseTrendScope(scope?: string): string {
  const s = scope || 'all';
  if (!isTrendScope(s)) throw new BadRequestException('Invalid scope');
  return s;
}

@ApiTags('Brands')
@Controller('/brand-trends')
export class BrandTrendsController {
  constructor(private _trends: BrandTrendsService) {}

  @Get('/')
  list(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Query('scope') scope: string) {
    return this._trends.list(org.id, user.id, orgRoleOf(org), parseTrendScope(scope));
  }

  // a run can take minutes: a normal awaited request, for the first fill and checks
  @Post('/run')
  run(@GetOrgFromRequest() org: Organization, @Body() body: { brandId?: string }) {
    if (!isOrgAdmin(orgRoleOf(org))) throw new ForbiddenException('Only an organization admin can run trends');
    const brandId = body?.brandId;
    if (brandId !== undefined && (typeof brandId !== 'string' || !TREND_ID.test(brandId))) throw new BadRequestException('Invalid brand');
    return this._trends.run(org.id, brandId);
  }

  @Post('/:id/idea')
  idea(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string) {
    return this._trends.saveAsIdea(org.id, user.id, orgRoleOf(org), id);
  }
}
// <<< SANAD-BRANDS
