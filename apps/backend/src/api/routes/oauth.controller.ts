import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OAuthService } from '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { User, Organization } from '@prisma/client';
import { AuthorizeOAuthQueryDto, ApproveOAuthDto } from '@gitroom/nestjs-libraries/dtos/oauth/authorize-oauth.dto';
import { TokenExchangeDto } from '@gitroom/nestjs-libraries/dtos/oauth/token-exchange.dto';

@ApiTags('OAuth')
@Controller('/oauth')
export class OAuthController {
  constructor(private _oauthService: OAuthService) {}

  @Get('/authorize')
  async authorize(@Query() query: AuthorizeOAuthQueryDto) {
    const app = await this._oauthService.validateAuthorizationRequest(
      query.client_id
    );

    return {
      app: {
        name: app.name,
        description: app.description,
        picture: app.picture,
        clientId: app.clientId,
        redirectUrl: app.redirectUrl,
      },
      state: query.state,
    };
  }

  @Post('/token')
  async token(@Body() body: TokenExchangeDto, @Headers('authorization') authorization?: string) {
    if (body.grant_type !== 'authorization_code') {
      throw new HttpException(
        { error: 'unsupported_grant_type' },
        HttpStatus.BAD_REQUEST
      );
    }

    // >>> SANAD-BRANDS: client_secret_basic (RFC 6749 2.3.1), the default when a client is not told otherwise
    let [clientId, clientSecret] = [body.client_id, body.client_secret];
    if ((!clientId || !clientSecret) && authorization?.startsWith('Basic ')) {
      const [id, ...secret] = Buffer.from(authorization.slice(6), 'base64').toString('utf8').split(':');
      [clientId, clientSecret] = [decodeURIComponent(id), decodeURIComponent(secret.join(':'))];
    }
    if (!clientId || !clientSecret) {
      throw new HttpException({ error: 'invalid_client' }, HttpStatus.UNAUTHORIZED);
    }
    // <<< SANAD-BRANDS

    return this._oauthService.exchangeCodeForToken(body.code, clientId, clientSecret);
  }
}

@ApiTags('OAuth')
@Controller('/oauth')
export class OAuthAuthorizedController {
  constructor(private _oauthService: OAuthService) {}

  @Post('/authorize')
  async approveOrDeny(
    @Body() body: ApproveOAuthDto,
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization
  ) {
    const app = await this._oauthService.validateAuthorizationRequest(
      body.client_id
    );

    if (body.action === 'deny') {
      const redirectUrl = new URL(app.redirectUrl);
      redirectUrl.searchParams.set('error', 'access_denied');
      if (body.state) {
        redirectUrl.searchParams.set('state', body.state);
      }
      return { redirect: redirectUrl.toString() };
    }

    const code = await this._oauthService.createAuthorizationCode(
      app.id,
      user.id,
      org.id
    );

    const redirectUrl = new URL(app.redirectUrl);
    redirectUrl.searchParams.set('code', code);
    if (body.state) {
      redirectUrl.searchParams.set('state', body.state);
    }
    return { redirect: redirectUrl.toString() };
  }
}
