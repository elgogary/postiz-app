import {
  LinkedinScraperAdapter,
  NormalizedPost,
  ResolvedProfile,
} from '@gitroom/nestjs-libraries/integrations/engagement/linkedin.scraper.interface';

// Fresh LinkedIn Scraper API (RapidAPI). Read-only. House style: native fetch, key via env, no axios.
const HOST = 'fresh-linkedin-scraper-api.p.rapidapi.com';
const BASE = `https://${HOST}/api/v1`;

function usernameFromUrl(url: string): string {
  const m = (url || '').match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : (url || '').trim();
}

export class FreshLinkedinAdapter implements LinkedinScraperAdapter {
  identifier = 'fresh-linkedin';

  // Kill switch (guardrail 3): auto-pull only runs when a key exists AND the flag is explicitly on.
  // Default off => the manager falls back to manual paste, so a dead vendor never empties the queue.
  available(): boolean {
    return (
      !!process.env.RAPIDAPI_KEY && process.env.ENGAGEMENT_AUTOPULL === 'true'
    );
  }

  private headers() {
    return {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY || '',
      'x-rapidapi-host': HOST,
    };
  }

  private async get(path: string): Promise<any> {
    // Short request-handler timeout: a hung/slow vendor aborts and degrades to manual (guardrail 3),
    // instead of piling up pending sockets. AbortError bubbles up to pullTarget's try/catch.
    const res = await fetch(`${BASE}${path}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`Fresh LinkedIn API ${res.status} on ${path}`);
    }
    return res.json();
  }

  async resolveProfile(linkedinUrl: string): Promise<ResolvedProfile> {
    const username = usernameFromUrl(linkedinUrl);
    const data = await this.get(
      `/user/profile?username=${encodeURIComponent(username)}`
    );
    const d = data?.data || data || {};
    return {
      name: d.name || d.full_name,
      headline: d.headline,
      urn: d.urn || d.profile_urn,
    };
  }

  async getLatestPost(
    linkedinUrl: string,
    urn?: string
  ): Promise<NormalizedPost | null> {
    const username = usernameFromUrl(linkedinUrl);
    let resolvedUrn = urn;
    if (!resolvedUrn) {
      resolvedUrn = (await this.resolveProfile(linkedinUrl)).urn;
    }
    const data = await this.get(
      `/user/posts?username=${encodeURIComponent(username)}${
        resolvedUrn ? `&urn=${encodeURIComponent(resolvedUrn)}` : ''
      }`
    );
    const posts = data?.data || data?.posts || [];
    const latest = Array.isArray(posts) ? posts[0] : null;
    if (!latest) {
      return null;
    }
    return {
      author: username,
      text: latest.text || latest.commentary || '',
      url: latest.url || latest.post_url || '',
      timestamp: latest.created_at || latest.posted_at || '',
      postUrn: latest.urn || latest.post_urn,
    };
  }
}
