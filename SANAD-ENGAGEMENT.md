# Sanad Engagement Module (fork addition)

The LinkedIn engagement module added on top of upstream Postiz. Everything is fenced with
`// >>> SANAD-ENGAGEMENT` / `// <<< SANAD-ENGAGEMENT` (or `# >>>` in `.env.example`) so the fork
rebases cheaply onto new upstream releases.

## What it is
A new `Engagement` section: tiered LinkedIn **targets** → pull each target's latest post →
AI-drafted **comment** in a brand voice → human **rewrites** it → **Mark posted** copies to
clipboard for a manual paste. Own-post scheduling stays native Postiz; nothing auto-comments.

## New files (no upstream conflict — pure additions)
- `libraries/nestjs-libraries/src/dtos/engagement/engagement.dto.ts`
- `libraries/nestjs-libraries/src/integrations/engagement/` — `linkedin.scraper.interface.ts`,
  `fresh.linkedin.adapter.ts`, `manual.adapter.ts`, `engagement.scraper.manager.ts`
- `libraries/nestjs-libraries/src/database/prisma/engagement/` — `engagement.repository.ts`, `engagement.service.ts`
- `apps/backend/src/api/routes/engagement.controller.ts`
- `apps/frontend/src/components/engagement/engagement.tsx`
- `apps/frontend/src/app/(app)/(site)/engagement/page.tsx`

## Upstream edits — the 6-item re-apply checklist (all sentinel-wrapped)
1. `schema.prisma` — `EngagementTarget` + `CommentDraft` models + 2 back-relations on `Organization`
2. `apps/backend/src/api/api.module.ts` — import + add `EngagementController` to `authenticatedController`
3. `libraries/nestjs-libraries/src/database/prisma/database.module.ts` — imports + add
   `EngagementRepository`, `EngagementService`, `EngagementScraperManager` to `providers`
4. `libraries/nestjs-libraries/src/openai/openai.service.ts` — `generateEngagementComment()` method
5. `apps/frontend/src/components/layout/top.menu.tsx` — `Engagement` nav item in `firstMenu`
6. `.env.example` — `RAPIDAPI_KEY`, `ENGAGEMENT_AUTOPULL`, `ENGAGEMENT_BRAND_VOICE`

## Rebase recipe (onto the next patched Postiz release)
```
git fetch upstream --tags
git rebase --onto <newtag> <oldtag> sanad/engagement
# re-apply the 6 sentinels above if any upstream anchor moved
docker build --build-arg NEXT_PUBLIC_VERSION=<newtag>-eng.<n> \
  -f Dockerfile.dev -t ghcr.io/elgogary/postiz-sanad:<newtag>-eng.<n> .
```
Always fork off a **patched** release tag — never v1.47.0 (unauthenticated SSRF CVEs). Current base: **v2.21.10**.

## Env vars
- `RAPIDAPI_KEY` — Fresh LinkedIn Scraper key (read-only). Rotate + keep server-side only.
- `ENGAGEMENT_AUTOPULL` — kill switch. Auto-pull runs ONLY when this is exactly `"true"` AND a key
  is set. Default off → every pull falls back to manual paste, so a dead vendor never empties the queue.
- `ENGAGEMENT_BRAND_VOICE` — optional override of the AI comment voice.

## Guardrails baked in
- **Swappable scraper** — one adapter interface (`{author,text,url,timestamp}`); Fresh → HarvestAPI
  is a config swap. Manual fallback always available. Vendor error/timeout → degrades to manual.
- **Rewrite-before-post** — `CommentDraft.edited` must be true (a real, non-empty human change);
  regenerate resets it; `markPosted` enforces it atomically + idempotently.
- **Health tab = real metrics only** — followers/cadence/coverage/public counts. Profile views,
  search appearances, SSI are owner-only private data → manual entry, never scraped or faked.

## Ops note (learned in deploy)
Run `prisma db push` (create the two tables) via a **clean container restart** (`docker restart postiz`),
NOT `pnpm run prisma-db-push` inside the live container — regenerating the client under the running
backend leaves it stuck (process alive, not listening on :3000, nginx → 502). A restart re-bootstraps clean.

## Auto-pull cron (fork addition, 2026-07-11)
Background timer so targets refresh without a click. Backend-only `@Cron` in
`apps/backend/src/services/engagement.cron.service.ts` → `EngagementService.runAutoPull()` →
`EngagementRepository.getAllPullable()`. Gated by the SAME kill switch as the button
(`ENGAGEMENT_AUTOPULL` + `RAPIDAPI_KEY`): manual adapter ⇒ the whole run is a no-op, so a dead/off
vendor never spins. Wiring (both sentinel-fenced): `ScheduleModule.forRoot()` + `EngagementCronService`
provider in `api.module.ts` (checklist item 2 now also touches this). New env, all optional with safe
defaults: `ENGAGEMENT_PULL_CRON` (blank ⇒ every 30 min), `ENGAGEMENT_PULL_MIN_AGE_MIN` (360),
`ENGAGEMENT_PULL_BATCH` (25). Sequential with a 1.5s gap per target to stay under the RapidAPI quota.
Cron runs in the backend process only (orchestrator/commands also load DatabaseModule but not this provider).

## Apify scraper adapter (cheaper vendor swap, 2026-07-11)
`apify.linkedin.adapter.ts` (identifier `apify`) added as a THIRD adapter, preferred first in the
scraper manager: `[Apify, Fresh, Manual]`. `available()` = `APIFY_TOKEN` set AND `ENGAGEMENT_AUTOPULL=true`.
Uses the Apify actor `harvestapi/linkedin-profile-posts` via `run-sync-get-dataset-items` (one blocking
HTTP call, ~8s, no async run/poll). Maps `content`->text, `linkedinUrl`->url, `postedAt.date`->timestamp,
`id`->postUrn, `author.name`->author. Input `{targetUrls:[profileUrl], maxPosts:1}`. Cheaper than the Fresh
RapidAPI vendor (~$1.5-2/1k posts vs $50/mo). New env: `APIFY_TOKEN`, `APIFY_POSTS_ACTOR`
(default `harvestapi~linkedin-profile-posts`). Whichever key is set wins; both off => manual paste.
