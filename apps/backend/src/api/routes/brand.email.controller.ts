// >>> SANAD-BRANDS: a brand's Email tab. Every method loads the brand with the caller's org first; contacts and import are for approvers.
import {
  BadRequestException, Body, CallHandler, Controller, ExecutionContext, Get, Injectable, NestInterceptor, Param, ParseIntPipe,
  PayloadTooLargeException, Post, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { catchError, throwError } from 'rxjs';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { orgRoleOf } from '@gitroom/nestjs-libraries/database/prisma/brands/brands.service';
import { BrandEmailService } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.email.service';

// Multer answers 413 for a file over the limit; the tab shows a plain 400 with the reason.
@Injectable()
class FileTooLarge implements NestInterceptor {
  intercept(_c: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(catchError((e) => throwError(() => (e instanceof PayloadTooLargeException ? new BadRequestException('The file is larger than 5 MB') : e))));
  }
}

@ApiTags('Brands')
@Controller('/brands')
export class BrandEmailController {
  constructor(private _email: BrandEmailService) {}

  @Get('/:customerId/email')
  overview(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string) {
    return this._email.overview(org.id, user.id, orgRoleOf(org), customerId);
  }

  @Post('/:customerId/email/history')
  importHistory(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string,
    @Body() body: { campaignIds?: unknown; listMap?: unknown }) {
    return this._email.importHistory(org.id, user.id, orgRoleOf(org), customerId, body?.campaignIds, body?.listMap);
  }

  @Get('/:customerId/email/:channelId/campaigns/:id')
  report(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string,
    @Param('channelId') channelId: string, @Param('id', ParseIntPipe) id: number) {
    return this._email.report(org.id, user.id, orgRoleOf(org), customerId, channelId, id);
  }

  @Get('/:customerId/email/:channelId/campaigns/:id/preview')
  preview(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string,
    @Param('channelId') channelId: string, @Param('id', ParseIntPipe) id: number) {
    return this._email.preview(org.id, user.id, orgRoleOf(org), customerId, channelId, id);
  }

  @Get('/:customerId/email/:channelId/lists/:listId/contacts')
  contacts(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string,
    @Param('channelId') channelId: string, @Param('listId', ParseIntPipe) listId: number, @Query('page') page?: string) {
    return this._email.contacts(org.id, user.id, orgRoleOf(org), customerId, channelId, listId, Number(page) || 1);
  }

  @Post('/:customerId/email/:channelId/lists/:listId/import')
  @UseInterceptors(FileTooLarge, FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  importContacts(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('customerId') customerId: string,
    @Param('channelId') channelId: string, @Param('listId', ParseIntPipe) listId: number,
    @UploadedFile() file: Express.Multer.File, @Body('agreed') agreed?: string) {
    return this._email.importContacts(org.id, user.id, orgRoleOf(org), customerId, channelId, listId, file, agreed === 'true');
  }
}
// <<< SANAD-BRANDS
