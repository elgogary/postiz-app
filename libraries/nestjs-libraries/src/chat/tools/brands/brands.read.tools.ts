// >>> SANAD-BRANDS: the read tools (anyone who can see the brand).
import { Injectable } from '@nestjs/common';
import { createTool } from '@mastra/core/tools';
import z from 'zod';
import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { BrandsService } from '@gitroom/nestjs-libraries/database/prisma/brands/brands.service';
import { BrandReviewService } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.review.service';
import { BrandIdeasService } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.ideas.service';
import { BRAND_ARG, ID, STATES, answer, person, pickBrand, plain } from './brands.tool.helpers';

const BRAND = z.string().max(120).describe(BRAND_ARG);

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

@Injectable()
export class BrandsListTool implements AgentToolInterface {
  constructor(private _brands: BrandsService) {}
  name = 'brands_list';

  run() {
    return createTool({
      id: 'brands_list',
      description: 'The brands in the Marketing Hub, with your role on each (view, create or approve), whether its posts '
        + 'need approval, and how many posts wait for you.',
      inputSchema: z.object({}),
      mcp: { annotations: { title: 'My brands', ...READ } },
      execute: async () => answer(async () => {
        const p = person();
        const brands = await this._brands.list(p.orgId, p.userId, p.role);
        return {
          brands: brands.map((b) => ({
            id: b.id, name: b.name, yourRole: b.role, requiresApproval: b.requiresApproval, waitingForYou: b.waiting,
            channels: b.channels.map((c) => c.name),
          })),
        };
      }),
    });
  }
}

@Injectable()
export class BrandHubTool implements AgentToolInterface {
  constructor(private _brands: BrandsService, private _review: BrandReviewService) {}
  name = 'brand_hub';

  run() {
    return createTool({
      id: 'brand_hub',
      description: `One brand's hub: its summary, voice and focus weeks, its Before publishing list, and its posts `
        + `with their state (${STATES}), who sent and who decided, the last comment, and the post's own check to `
        + `confirm before approving (verify).`,
      inputSchema: z.object({ brand: BRAND }),
      mcp: { annotations: { title: 'Brand hub', ...READ } },
      execute: async (input) => answer(async () => {
        const p = person();
        const b = pickBrand(await this._brands.list(p.orgId, p.userId, p.role), input.brand);
        const [hub, board] = await Promise.all([
          this._brands.get(p.orgId, p.userId, p.role, b.id), this._review.cards(p.orgId, p.userId, p.role, b.id),
        ]);
        const sections = hub.sections as Record<string, { content: string | null; rows: string[][] | null }>;
        return {
          brand: b.name, id: b.id, yourRole: b.role, requiresApproval: b.requiresApproval,
          summary: plain(sections.summary?.content), voice: plain(sections.voice?.content, 3000),
          focus: (sections.focus?.rows || []).map(([from, to, title, desc]) => ({ from, to, title, desc })),
          beforePublishing: (sections.review?.rows || []).map(([item]) => item),
          posts: board.cards.map((c) => ({
            postId: c.postId, briefId: c.briefId, date: c.date, state: c.state, format: c.format, title: c.title,
            channel: c.channel, sentBy: c.sentBy, decidedBy: c.decidedBy, comments: c.comments, lastNote: c.lastNote,
            verify: c.verify.trim() || null,
          })),
        };
      }),
    });
  }
}

@Injectable()
export class PostCommentsTool implements AgentToolInterface {
  constructor(private _brands: BrandsService, private _review: BrandReviewService) {}
  name = 'post_comments';

  run() {
    return createTool({
      id: 'post_comments',
      description: 'The comments on one post of a brand, oldest first, with who wrote each and the slide it is pinned to.',
      inputSchema: z.object({ brand: BRAND, postId: ID.describe('The postId from brand_hub') }),
      mcp: { annotations: { title: 'Post comments', ...READ } },
      execute: async (input) => answer(async () => {
        const p = person();
        const b = pickBrand(await this._brands.list(p.orgId, p.userId, p.role), input.brand);
        return { comments: await this._review.comments(p.orgId, p.userId, p.role, b.id, input.postId) };
      }),
    });
  }
}

@Injectable()
export class IdeasListTool implements AgentToolInterface {
  constructor(private _brands: BrandsService, private _ideas: BrandIdeasService) {}
  name = 'ideas_list';

  run() {
    return createTool({
      id: 'ideas_list',
      description: 'The idea bank for one brand: each idea with its id, status (NEW, PLANNED, POSTED, DROPPED), hook, '
        + 'angle and points. Only NEW ideas can be drafted.',
      inputSchema: z.object({
        brand: BRAND,
        all: z.boolean().optional().describe('Also show planned, posted and dropped ideas (default: new ideas only)'),
      }),
      mcp: { annotations: { title: 'Brand ideas', ...READ } },
      execute: async (input) => answer(async () => {
        const p = person();
        const b = pickBrand(await this._brands.list(p.orgId, p.userId, p.role), input.brand);
        const { ideas, more } = await this._ideas.list(p.orgId, p.userId, p.role, b.id);
        return {
          ideas: ideas.filter((i) => input.all || i.status === 'NEW')
            .map((i) => ({ id: i.id, status: i.status, hook: i.hook, angle: i.angle, points: i.bullets })),
          more,
        };
      }),
    });
  }
}
// <<< SANAD-BRANDS
