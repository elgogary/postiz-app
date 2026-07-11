import { Injectable } from '@nestjs/common';
import { FreshLinkedinAdapter } from '@gitroom/nestjs-libraries/integrations/engagement/fresh.linkedin.adapter';
import { ApifyLinkedinAdapter } from '@gitroom/nestjs-libraries/integrations/engagement/apify.linkedin.adapter';
import { ManualAdapter } from '@gitroom/nestjs-libraries/integrations/engagement/manual.adapter';
import { LinkedinScraperAdapter } from '@gitroom/nestjs-libraries/integrations/engagement/linkedin.scraper.interface';

// Picks the first available adapter. Manual is always available and last, so pick() never returns undefined.
// Mirrors the socialIntegrationList / VideoManager "array of instances, choose by availability" idiom.
@Injectable()
export class EngagementScraperManager {
  private readonly adapters: LinkedinScraperAdapter[] = [
    new ApifyLinkedinAdapter(),
    new FreshLinkedinAdapter(),
    new ManualAdapter(),
  ];

  pick(): LinkedinScraperAdapter {
    return (
      this.adapters.find((a) => a.available()) ||
      this.adapters[this.adapters.length - 1]
    );
  }

  isAuto(): boolean {
    return this.pick().identifier !== 'manual';
  }
}
