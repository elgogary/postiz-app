// >>> SANAD-BRANDS: weekly trends live under /brand-trends (same reason as /brand-ideas).
import { BadRequestException, Body, Controller, ForbiddenException, Get, Logger, Param, Post, Query } from '@nestjs/common';
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
  private readonly _log = new Logger('BrandTrends');

  constructor(private _trends: BrandTrendsService) {}

  @Get('/')
  list(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Query('scope') scope: string) {
    return this._trends.list(org.id, user.id, orgRoleOf(org), parseTrendScope(scope));
  }

  // a run takes minutes (the web proxy gives up after one): it starts here and goes on in the background; read the
  // rows back with GET when it is done
  @Post('/run')
  run(@GetOrgFromRequest() org: Organization, @Body() body: { brandId?: string }) {
    if (!isOrgAdmin(orgRoleOf(org))) throw new ForbiddenException('Only an organization admin can run trends');
    const brandId = body?.brandId;
    if (brandId !== undefined && (typeof brandId !== 'string' || !TREND_ID.test(brandId))) throw new BadRequestException('Invalid brand');
    this._trends.run(org.id, brandId).then(
      (res) => this._log.log(`Trends run: ${res.filter((r) => !r.skipped).length} brands, ${res.reduce((n, r) => n + (r.trends || 0), 0)} trends`),
      (e) => this._log.error(`Trends run failed: ${(e as Error)?.message}`),
    );
    return { started: true };
  }

  @Post('/:id/idea')
  idea(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string) {
    return this._trends.saveAsIdea(org.id, user.id, orgRoleOf(org), id);
  }
}
// <<< SANAD-BRANDS
