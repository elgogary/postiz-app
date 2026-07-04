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
