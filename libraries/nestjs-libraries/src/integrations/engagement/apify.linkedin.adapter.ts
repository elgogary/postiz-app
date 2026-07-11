import {
  LinkedinScraperAdapter,
  NormalizedPost,
  ResolvedProfile,
} from '@gitroom/nestjs-libraries/integrations/engagement/linkedin.scraper.interface';

// Apify LinkedIn Profile Posts actor (harvestapi/linkedin-profile-posts). Read-only, no LinkedIn login.
// House style: native fetch, token via env, no axios. Uses run-sync-get-dataset-items so a single HTTP
// call blocks until the scrape finishes and returns the dataset items (no async run/poll to manage).
// Cheaper than the Fresh RapidAPI vendor; the manager prefers it whenever APIFY_TOKEN is set.
const API = 'https://api.apify.com/v2';
const DEFAULT_ACTOR = 'harvestapi~linkedin-profile-posts';

export class ApifyLinkedinAdapter implements LinkedinScraperAdapter {
  identifier = 'apify';

  // Kill switch (guardrail 3): only runs when a token exists AND auto-pull is explicitly on.
  // Default off => the manager falls through to Fresh, then manual paste.
  available(): boolean {
    return (
      !!process.env.APIFY_TOKEN && process.env.ENGAGEMENT_AUTOPULL === 'true'
    );
  }

  // Apify takes the profile URL directly, so there is no separate urn-resolve step.
  async resolveProfile(): Promise<ResolvedProfile> {
    return {};
  }

  async getLatestPost(linkedinUrl: string): Promise<NormalizedPost | null> {
    const actor = process.env.APIFY_POSTS_ACTOR || DEFAULT_ACTOR;
    const url = `${API}/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(
      process.env.APIFY_TOKEN || ''
    )}`;
    // Short request timeout: a slow/blocked run aborts and the caller degrades to manual (guardrail 3),
    // instead of holding the pull open. AbortError bubbles to pullTarget's try/catch.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrls: [linkedinUrl],
        maxPosts: 1,
        scrapeReactions: false,
        scrapeComments: false,
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) {
      throw new Error(`Apify actor ${actor} ${res.status}`);
    }
    const items = (await res.json()) as any[];
    const latest = Array.isArray(items) ? items[0] : null;
    // A bare repost has empty content and nothing to comment on -> treat as no post (manual fallback).
    if (!latest || !latest.content) {
      return null;
    }
    return {
      author:
        latest.author?.name || latest.author?.publicIdentifier || linkedinUrl,
      text: latest.content || '',
      url: latest.linkedinUrl || '',
      timestamp:
        latest.postedAt?.date ||
        (latest.postedAt?.timestamp ? String(latest.postedAt.timestamp) : ''),
      postUrn: latest.id ? String(latest.id) : latest.entityId,
    };
  }
}
