import {
  LinkedinScraperAdapter,
  NormalizedPost,
  ResolvedProfile,
} from '@gitroom/nestjs-libraries/integrations/engagement/linkedin.scraper.interface';

// Always-available fallback (guardrail 3): returns nothing so the caller asks the human to paste
// the post text they are already looking at. The review queue can never go empty when a vendor dies.
export class ManualAdapter implements LinkedinScraperAdapter {
  identifier = 'manual';

  available(): boolean {
    return true;
  }

  async resolveProfile(): Promise<ResolvedProfile> {
    return {};
  }

  async getLatestPost(): Promise<NormalizedPost | null> {
    return null;
  }
}
