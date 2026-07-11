// >>> SANAD-ENGAGEMENT
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EngagementService } from '@gitroom/nestjs-libraries/database/prisma/engagement/engagement.service';

// Backend-only @Cron wrapper so auto-pull runs in exactly ONE process (the orchestrator/commands
// apps also load DatabaseModule; keeping the timer here keeps it off those). All batching and the
// kill-switch gate live in EngagementService.runAutoPull() — this file only owns the schedule.
@Injectable()
export class EngagementCronService {
  private readonly _logger = new Logger('EngagementAutoPull');

  constructor(private _engagement: EngagementService) {}

  @Cron(process.env.ENGAGEMENT_PULL_CRON || CronExpression.EVERY_30_MINUTES)
  async handle() {
    try {
      const res = await this._engagement.runAutoPull();
      if (!('skipped' in res)) {
        this._logger.log(`auto-pull ${JSON.stringify(res)}`);
      }
    } catch (e) {
      this._logger.error(`auto-pull failed: ${(e as Error)?.message}`);
    }
  }
}
// <<< SANAD-ENGAGEMENT
