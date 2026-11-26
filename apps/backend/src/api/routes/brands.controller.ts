// >>> SANAD-BRANDS
import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { BrandsService, orgRoleOf } from '@gitroom/nestjs-libraries/database/prisma/brands/brands.service';
import { ImportPlanDto, SaveSectionDto, SetAccessDto, SetSettingsDto } from '@gitroom/nestjs-libraries/dtos/brands/brands.dto';

@ApiTags('Brands')
@Controller('/brands')
export class BrandsController {
  constructor(private _brands: BrandsService) {}

  @Get('/')
  list(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User) {
    return this._brands.list(org.id, user.id, orgRoleOf(org));
  }

  @Get('/:customerId')
  get(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string) {
    return this._brands.get(org.id, user.id, orgRoleOf(org), customerId);
  }

  @Put('/:customerId/sections/:key')
  save(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string,
    @Param('key') key: string, @Body() body: SaveSectionDto) {
    return this._brands.saveSection(org.id, user.id, orgRoleOf(org), customerId, key, body);
  }

  @Get('/:customerId/access')
  access(@GetOrgFromRequest() org: Organization, @Param('customerId') customerId: string) {
    return this._brands.getAccess(org.id, orgRoleOf(org), customerId);
  }

  @Put('/:customerId/access')
  setAccess(@GetOrgFromRequest() org: Organization, @Param('customerId') customerId: string, @Body() body: SetAccessDto) {
    return this._brands.setAccess(org.id, orgRoleOf(org), customerId, body);
  }

  @Put('/:customerId/settings')
  settings(@GetOrgFromRequest() org: Organization, @Param('customerId') customerId: string, @Body() body: SetSettingsDto) {
    return this._brands.setSettings(org.id, orgRoleOf(org), customerId, body);
  }

  @Post('/:customerId/import')
  importPlan(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string,
    @Body() body: ImportPlanDto) {
    return this._brands.importPlan(org.id, user.id, orgRoleOf(org), customerId, body);
  }
}
// <<< SANAD-BRANDS
