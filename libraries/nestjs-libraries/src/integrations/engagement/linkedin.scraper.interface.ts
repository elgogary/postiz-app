// Normalized post shape every scraper adapter must return.
// Guardrail 3: swapping vendors (Fresh -> HarvestAPI -> ...) is a config/adapter change, never a rewrite.
export interface NormalizedPost {
  author: string;
  text: string;
  url: string;
  timestamp: string; // ISO string or the provider's raw created_at
  postUrn?: string;
}

export interface ResolvedProfile {
  name?: string;
  headline?: string;
  urn?: string;
}

export interface LinkedinScraperAdapter {
  identifier: string;
  // available() === false => the manager falls through to the next adapter (manual is always available).
  available(): boolean;
  resolveProfile(linkedinUrl: string): Promise<ResolvedProfile>;
  getLatestPost(linkedinUrl: string, urn?: string): Promise<NormalizedPost | null>;
}
