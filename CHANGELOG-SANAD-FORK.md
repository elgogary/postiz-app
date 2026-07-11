# Changelog (Sanad fork)

Sanad Marketing Hub additions on top of upstream Postiz. Keep a Changelog format. Fork branch: `sanad/engagement`. Full context and deploy runbook: `SANAD-ENGAGEMENT.md`.

## [Unreleased] - 2026-07-11 (live images eng.7 to eng.15 on sandbox-1)

### Added
- Engagement: background auto-pull cron that fetches each due target's latest LinkedIn post on a schedule, gated by the same kill switch as the manual pull (eb80798).
- Engagement: Apify LinkedIn posts adapter (harvestapi actor) preferred over the RapidAPI Fresh vendor, about 1.5 to 2 USD per 1k posts vs 50/mo (714aaf4).
- Agent: the Postiz AI agent runs on DeepSeek via `AGENT_AI_MODEL` + `OPENAI_BASE_URL`, structured output forced to tool-calling, image step skips when the provider is text-only (4888910). `TAVILY_API_KEY` wired so its research step uses real web sources instead of fabricating.
- Design Media: AI image generation routed to Fal.ai (`FAL_KEY` + `FAL_IMAGE_MODEL`) and a Design Media sidebar item that saves generated images to the Media library (02f6fee).
- LinkedIn: personal-only scopes (`openid profile w_member_social`) for an instant connect without the Community Management API review (14ae025); personal profile posting connected and verified.
- My LinkedIn: personal engagement analytics page showing likes, comments and reposts per post via the Apify scraper (5f16511); seeded with a default profile plus a cached last pull that auto-loads on open and refreshes on demand (ea716b6).

### Changed
- Engagement: richer AI comment prompt with post-author context and a switch to the `deepseek-reasoner` model for more specific drafts (30bbdda).

### Fixed
- Engagement: state-aware draft-buttons hint so the intentionally disabled Save and Post buttons explain the rewrite-before-post rule (7e8234a).

### Deploy notes (recurring traps)
- Recreate the container with `--env-file postiz.env`, or `${POSTGRES_PASSWORD}` and `${OPENAI_API_KEY}` resolve empty and the backend fails DB auth.
- After a recreate, run `docker restart traefik` if the site returns 404 for every path (the docker provider drops the router).
- If the backend hangs on boot (nginx 502, port 3000 not listening while pm2 says online), run `docker restart postiz`.

### Parked (needs external action)
- Design Media images: the Fal account balance is exhausted (403); top up at fal.ai to activate. No redeploy needed.
- Company-Page impressions analytics: needs the LinkedIn Community Management API review (personal profiles have no analytics API).
