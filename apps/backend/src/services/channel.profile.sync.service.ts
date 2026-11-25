// >>> SANAD-CHANNEL-SYNC
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Integration } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

type Profile = { name?: string; picture?: string };

// Postiz copies a channel's name and picture once, at connect; token refresh keeps the old ones.
// This job re-reads them from LinkedIn and saves only what LinkedIn changed since the last run
// (last-seen values in Redis), so a name the user edits in Preferences is not undone daily.
@Injectable()
export class ChannelProfileSyncService implements OnApplicationBootstrap {
  private readonly _logger = new Logger('ChannelProfileSync');
  private readonly _storage = UploadFactory.createStorage();

  constructor(
    private _integration: PrismaRepository<'integration'>,
    private _integrationManager: IntegrationManager
  ) {}

  onApplicationBootstrap() {
    setTimeout(() => this.handle(), 60_000);
  }

  @Cron(process.env.CHANNEL_PROFILE_SYNC_CRON || CronExpression.EVERY_DAY_AT_5AM)
  async handle() {
    try {
      const channels = await this._integration.model.integration.findMany({
        where: {
          providerIdentifier: { in: ['linkedin', 'linkedin-page'] },
          deletedAt: null,
          disabled: false,
          inBetweenSteps: false,
          refreshNeeded: false,
        },
      });

      let updated = 0;
      for (const channel of channels) {
        try {
          updated += (await this._sync(channel)) ? 1 : 0;
        } catch (e) {
          this._logger.warn(`${channel.id} ${channel.name}: ${(e as Error)?.message}`);
        }
      }
      this._logger.log(`checked ${channels.length}, updated ${updated}`);
    } catch (e) {
      this._logger.error(`sync failed: ${(e as Error)?.message}`);
    }
  }

  private async _sync(channel: Integration) {
    const fresh = await this._fetchProfile(channel);
    if (!fresh.name && !fresh.picture) {
      throw new Error('LinkedIn returned no name or picture');
    }
    const pictureKey = fresh.picture?.split('?')[0];
    const cacheKey = `channel-profile:${channel.id}`;
    const cached = await ioRedis.get(cacheKey);

    // No last-seen yet (first run, or Redis lost it): record only, so a custom name is never undone.
    const data: Profile = {};
    if (cached) {
      const seen: Profile = JSON.parse(cached);
      if (fresh.name && fresh.name !== seen.name && fresh.name !== channel.name) {
        data.name = fresh.name;
      }
      if (pictureKey && pictureKey !== seen.picture) {
        data.picture = await this._storage.uploadSimple(fresh.picture!);
      }
    }
    if (Object.keys(data).length) {
      await this._integration.model.integration.update({
        where: { id: channel.id },
        data,
      });
    }

    await ioRedis.set(
      cacheKey,
      JSON.stringify({ name: fresh.name, picture: pictureKey })
    );
    return Object.keys(data).length > 0;
  }

  private async _fetchProfile(channel: Integration): Promise<Profile> {
    if (channel.providerIdentifier === 'linkedin-page') {
      const page = await this._integrationManager
        .getSocialIntegration('linkedin-page')
        .fetchPageInformation!(channel.token, { page: channel.internalId });
      return { name: page.name, picture: page.picture };
    }

    const res = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${channel.token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`userinfo ${res.status}`);
    }
    const { name, picture } = await res.json();
    return { name, picture };
  }
}
// <<< SANAD-CHANNEL-SYNC
