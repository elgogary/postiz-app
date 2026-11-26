// >>> SANAD-BRANDS: ideas live under /brand-ideas (not /brands/...: /brands/:customerId would take "ideas" as a brand).
import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { orgRoleOf } from '@gitroom/nestjs-libraries/database/prisma/brands/brands.service';
import { BrandIdeasService } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.ideas.service';
import { IdeaDto, IdeaStatusDto, MigrateIdeasDto, PlanIdeaDto } from '@gitroom/nestjs-libraries/dtos/brands/brand.ideas.dto';

@ApiTags('Brands')
@Controller('/brand-ideas')
export class BrandIdeasController {
  constructor(private _ideas: BrandIdeasService) {}

  @Get('/')
  list(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Query('scope') scope: string) {
    return this._ideas.list(org.id, user.id, orgRoleOf(org), scope || 'all');
  }

  @Post('/')
  create(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: IdeaDto) {
    return this._ideas.create(org.id, user.id, orgRoleOf(org), body);
  }

  @Post('/migrate')
  migrate(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: MigrateIdeasDto) {
    return this._ideas.migrate(org.id, user.id, orgRoleOf(org), body);
  }

  @Put('/:id')
  update(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string, @Body() body: IdeaDto) {
    return this._ideas.update(org.id, user.id, orgRoleOf(org), id, body);
  }

  @Put('/:id/status')
  status(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string, @Body() body: IdeaStatusDto) {
    return this._ideas.setStatus(org.id, user.id, orgRoleOf(org), id, body.status);
  }

  @Post('/:id/plan')
  plan(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string, @Body() body: PlanIdeaDto) {
    return this._ideas.plan(org.id, user.id, orgRoleOf(org), id, body);
  }
}
// <<< SANAD-BRANDS
