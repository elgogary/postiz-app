// >>> SANAD-BRANDS: ideas (spec rule 8): list, add, edit, drop and restore, migrate the old free-text ideas, and plan
// an idea into a brand (rule 7: the AI first draft). Rights come from BrandsService; every read is org-scoped.
import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ContentIdea } from '@prisma/client';
import { BrandsService } from '@gitroom/nestjs-libraries/database/prisma/brands/brands.service';
import { BrandIdeasRepository, LIST_CAP } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.ideas.repository';
import { BrandPostsRepository } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.posts.repository';
import { BrandReviewService } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.review.service';
import { BrandDraftService } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.draft.service';
import { BrandRole, OrgRole, canEdit, isOrgAdmin } from '@gitroom/helpers/brands/brand.rules';
import { FORMATS, Format } from '@gitroom/helpers/brands/post.rules';
import {
  DRAFT_VERIFY, IdeaFields, IdeaRow, IdeaView, TOPICS, composeIdeaText, ideaView, mapTagsToBrands, parseIdeaText, topicFromTags,
} from '@gitroom/helpers/brands/idea.rules';
import { IdeaDto, MigrateIdeasDto, PlanIdeaDto } from '@gitroom/nestjs-libraries/dtos/brands/brand.ideas.dto';

type Brand = { id: string; name: string; role: BrandRole };

const asRow = (r: ContentIdea): IdeaRow => ({
  id: r.id, idea: r.idea, note: r.note, source: r.source, tags: r.tags, createdAt: r.createdAt.toISOString(),
  hook: r.hook, angle: r.angle, bullets: r.bullets, brandIds: r.brandIds, topic: r.topic, pillars: r.pillars,
  format: r.format, status: r.status, briefId: r.briefId,
});

const SKEW = 5 * 60000;
const HOUR = 3600000;
const MIGRATE_CHUNK = 500;

const list20 = (v: string[] | undefined) => (v || []).map((x) => x.trim()).filter(Boolean).slice(0, 20);

@Injectable()
export class BrandIdeasService {
  private readonly _log = new Logger('BrandIdeasService');

  constructor(private _brands: BrandsService, private _repo: BrandIdeasRepository, private _posts: BrandPostsRepository,
    private _review: BrandReviewService, private _drafts: BrandDraftService) {}

  private brandsOf(orgId: string, userId: string, orgRole: OrgRole): Promise<Brand[]> {
    return this._brands.list(orgId, userId, orgRole) as Promise<Brand[]>;
  }

  // An idea with brands is written by someone who may create on one of them; an idea with no brand by anyone who may
  // create on any brand.
  private mayWrite(brands: Brand[], brandIds: string[]) {
    const ids = brandIds.length ? brandIds : brands.map((b) => b.id);
    return ids.some((id) => this.writable(brands, id));
  }

  private writable(brands: Brand[], id: string) {
    return canEdit(brands.find((b) => b.id === id)?.role as BrandRole);
  }

  private fields(brands: Brand[], dto: IdeaDto): IdeaFields {
    const hook = (dto.hook || '').trim();
    if (!hook) throw new BadRequestException('Write the hook');
    const brandIds = list20(dto.brandIds);
    if (brandIds.some((id) => !brands.some((b) => b.id === id))) throw new BadRequestException('Unknown brand');
    return {
      hook, angle: (dto.angle || '').trim(), bullets: list20(dto.bullets), brandIds,
      topic: (TOPICS as readonly string[]).includes(dto.topic || '') ? (dto.topic as string) : 'General',
      pillars: list20(dto.pillars), format: (FORMATS as string[]).includes(dto.format || '') ? (dto.format as Format) : '',
      source: (dto.source || '').trim(),
    };
  }

  private async view(orgId: string, row: ContentIdea): Promise<IdeaView> {
    const plan = row.briefId ? (await this._repo.plans(orgId, [row.briefId]))[0] || null : null;
    return ideaView(asRow(row), plan);
  }

  async list(orgId: string, userId: string, orgRole: OrgRole, scope: string) {
    const brands = await this.brandsOf(orgId, userId, orgRole);
    if (scope !== 'all' && scope !== 'none' && !brands.some((b) => b.id === scope)) throw new NotFoundException('Brand not found');
    const read = await this._repo.list(orgId);
    const more = read.length > LIST_CAP;
    const rows = read.slice(0, LIST_CAP);
    const plans = await this._repo.plans(orgId, rows.map((r) => r.briefId).filter((x): x is string => !!x));
    const planOf = new Map(plans.map((p) => [p.briefId, p]));
    const ideas = rows.map((r) => ideaView(asRow(r), r.briefId ? planOf.get(r.briefId) || null : null))
      .filter((v) => (scope === 'all' ? true : scope === 'none' ? v.brandIds.length === 0 : v.brandIds.includes(scope)));
    const pillars = await this._brands.pillarsByBrand(orgId);
    return { brands: brands.map((b) => ({ id: b.id, name: b.name, role: b.role, pillars: pillars[b.id] || [] })), topics: [...TOPICS], ideas, more };
  }

  async create(orgId: string, userId: string, orgRole: OrgRole, dto: IdeaDto) {
    const brands = await this.brandsOf(orgId, userId, orgRole);
    const f = this.fields(brands, dto);
    // Every brand ticked must be one the person may create on, so an idea never lands on a brand they only view.
    const ok = f.brandIds.length ? f.brandIds.every((b) => this.writable(brands, b)) : this.mayWrite(brands, []);
    if (!ok) throw new ForbiddenException('You can view these brands but not add ideas');
    const row = await this._repo.create({
      organizationId: orgId, idea: composeIdeaText(f), source: f.source || null, tags: [], note: null,
      hook: f.hook, angle: f.angle, bullets: f.bullets, brandIds: f.brandIds, topic: f.topic, pillars: f.pillars, format: f.format, status: 'NEW',
    });
    return ideaView(asRow(row as ContentIdea), null);
  }

  async update(orgId: string, userId: string, orgRole: OrgRole, id: string, dto: IdeaDto) {
    const brands = await this.brandsOf(orgId, userId, orgRole);
    const row = await this._repo.idea(orgId, id);
    if (!row) throw new NotFoundException('Idea not found');
    const f = this.fields(brands, dto);
    const added = f.brandIds.filter((b) => !row.brandIds.includes(b));
    if (!this.mayWrite(brands, row.brandIds) || added.some((b) => !this.writable(brands, b))) {
      throw new ForbiddenException('You can view this idea but not change it');
    }
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    if (row.briefId && !same(f.brandIds, row.brandIds)) throw new BadRequestException('A planned idea keeps its brands');
    const saved = await this._repo.update(orgId, id, {
      idea: composeIdeaText(f), source: f.source || null, hook: f.hook, angle: f.angle, bullets: f.bullets, brandIds: f.brandIds,
      topic: f.topic, pillars: f.pillars, format: f.format,
    });
    return this.view(orgId, saved as ContentIdea);
  }

  async setStatus(orgId: string, userId: string, orgRole: OrgRole, id: string, status: 'DROPPED' | 'NEW') {
    const brands = await this.brandsOf(orgId, userId, orgRole);
    const row = await this._repo.idea(orgId, id);
    if (!row) throw new NotFoundException('Idea not found');
    if (!this.mayWrite(brands, row.brandIds)) throw new ForbiddenException('You can view this idea but not change it');
    const now = (await this.view(orgId, row)).status;
    if (status === 'DROPPED' && now !== 'NEW') throw new BadRequestException('Only a new idea can be dropped');
    if (status === 'NEW' && now !== 'DROPPED') throw new BadRequestException('Only a dropped idea can be restored');
    if (!(await this._repo.moveStatus(orgId, id, status === 'DROPPED' ? 'NEW' : 'DROPPED', status))) {
      throw new BadRequestException('This idea changed a moment ago');
    }
    return { ok: true };
  }

  async migrate(orgId: string, userId: string, orgRole: OrgRole, dto: MigrateIdeasDto) {
    if (!isOrgAdmin(orgRole)) throw new ForbiddenException('Only an admin can move the ideas');
    const brands = await this.brandsOf(orgId, userId, orgRole);
    const tagMap = Object.fromEntries(Object.entries(dto.tagMap || {}).filter(([, id]) => brands.some((b) => b.id === id)));
    const rows = await this._repo.unmigrated(orgId);
    const byBrand: Record<string, number> = {};
    const byTopic: Record<string, number> = {};
    let split = 0;
    let noBrand = 0;
    const ops = rows.map((r) => {
      const p = parseIdeaText(r.idea);
      const brandIds = r.brandIds.length ? r.brandIds : mapTagsToBrands(r.tags, brands, tagMap);
      const topic = topicFromTags(r.tags);
      if (p.split) split += 1;
      if (!brandIds.length) noBrand += 1;
      for (const id of brandIds) {
        const name = brands.find((b) => b.id === id)?.name || id;
        byBrand[name] = (byBrand[name] || 0) + 1;
      }
      byTopic[topic] = (byTopic[topic] || 0) + 1;
      return () => this._repo.updateOp(orgId, r.id, { hook: p.hook, angle: p.angle, bullets: p.bullets, brandIds, topic });
    });
    const summary = { total: rows.length, split, noBrand, byBrand, byTopic };
    if (dto.dryRun) return { dryRun: true, ...summary };
    // One transaction per chunk keeps each under the transaction timeout; a run cut short is finished by the next run,
    // which reads only the rows still without a hook.
    for (let i = 0; i < ops.length; i += MIGRATE_CHUNK) await this._repo.saveAll(ops.slice(i, i + MIGRATE_CHUNK).map((op) => op()));
    return { dryRun: false, ...summary };
  }

  // The idea is marked Planned as soon as its brief exists, so a later failure (the draft) never leaves a planned
  // post behind an idea that still reads New.
  async plan(orgId: string, userId: string, orgRole: OrgRole, id: string, dto: PlanIdeaDto) {
    const ctx = await this._brands.context(orgId, userId, orgRole, dto.customerId);
    if (!canEdit(ctx.role)) throw new ForbiddenException('You can view this brand but not plan posts');
    const row = await this._repo.idea(orgId, id);
    if (!row) throw new NotFoundException('Idea not found');
    const idea = await this.view(orgId, row);
    if (idea.status !== 'NEW') throw new BadRequestException('Only a new idea can be planned');
    if (idea.brandIds.length && !idea.brandIds.includes(dto.customerId)) throw new BadRequestException('This idea is not for this brand');
    const when = Date.parse(dto.date);
    if (Number.isNaN(when)) throw new BadRequestException('Pick the date');
    // A bare day (YYYY-MM-DD) is a calendar day: valid while it is still that day somewhere (UTC-12). A full time must
    // not have passed, with a few minutes for clock drift.
    const passed = /^\d{4}-\d{2}-\d{2}$/.test(dto.date)
      ? dto.date < new Date(Date.now() - 12 * HOUR).toISOString().slice(0, 10)
      : when < Date.now() - SKEW;
    if (passed) throw new BadRequestException('Pick a date that has not passed');
    const briefId = randomUUID();
    const brandIds = idea.brandIds.includes(dto.customerId) ? idea.brandIds : [...idea.brandIds, dto.customerId];
    if (!(await this._repo.claim(orgId, id, briefId, brandIds))) throw new BadRequestException('This idea was planned a moment ago');
    try {
      await this._posts.createBrief({
        id: briefId, orgId, customerId: dto.customerId, ideaId: id, plannedAt: new Date(when), format: dto.format, title: idea.hook,
        sub: idea.angle, slides: idea.bullets, pillars: idea.pillars,
      });
    } catch (e) {
      await this._repo.update(orgId, id, { status: 'NEW', briefId: null, brandIds: idea.brandIds })
        .catch((r) => this._log.error(`Plan it: idea ${id} stays Planned without its brief: ${(r as Error).message}`));
      throw e;
    }
    const noChannel = ctx.channels.length === 0;
    const firstDraft = dto.ai && !noChannel && await this.firstDraft(orgId, userId, orgRole, dto, ctx.customer.name, idea, briefId);
    return { briefId, firstDraft, aiFailed: dto.ai && !noChannel && !firstDraft, noChannel: dto.ai && noChannel };
  }

  // Rule 7: any failure here (the AI, saving its text, making the Draft) leaves the idea planned and reports the draft
  // as failed; text the AI wrote stays on the planned post, so a Draft made later from Posts starts from it. The post is
  // marked a first draft only once its Draft exists.
  private async firstDraft(orgId: string, userId: string, orgRole: OrgRole, dto: PlanIdeaDto, brand: string, idea: IdeaView, briefId: string) {
    try {
      const book = await this._brands.get(orgId, userId, orgRole, dto.customerId);
      const checks = ((book.sections.review?.rows as string[][] | null) || []).map((r) => (r[0] || '').trim()).filter(Boolean);
      const draft = await this._drafts.write({ brand, voice: book.sections.voice?.content || '', checks, idea, format: dto.format });
      if (!draft) return false;
      await this._posts.updateBrief(briefId, {
        caption: draft.caption, slides: draft.slides, slidesLabel: draft.slidesLabel, verify: DRAFT_VERIFY,
      });
      await this._review.createDraft(orgId, userId, orgRole, dto.customerId, briefId, { date: dto.date });
      await this._posts.updateBrief(briefId, { firstDraft: true });
      return true;
    } catch (e) {
      this._log.warn(`Plan it: the first draft was not made: ${(e as Error).message}`);
      return false;
    }
  }
}
// <<< SANAD-BRANDS
