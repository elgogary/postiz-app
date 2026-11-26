// >>> SANAD-BRANDS
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BrandsRepository } from '@gitroom/nestjs-libraries/database/prisma/brands/brands.repository';
import { BrandPostsRepository } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.posts.repository';
import { ImportPlanDto, SaveSectionDto, SetAccessDto, SetSettingsDto } from '@gitroom/nestjs-libraries/dtos/brands/brands.dto';
import {
  AccessRole, BrandRole, OrgRole, canEdit, cleanHtml, isOrgAdmin, isRowSection, isTextSection, resolveBrandRole, validateRows,
} from '@gitroom/helpers/brands/brand.rules';
import { BriefWrite, matchPosts } from '@gitroom/helpers/brands/post.rules';
import { parsePlan } from '@gitroom/helpers/brands/plan.parser';
import { prepareImport } from '@gitroom/helpers/brands/plan.import';

export const orgRoleOf = (org: unknown): OrgRole =>
  ((org as { users?: { role?: OrgRole }[] })?.users?.[0]?.role || 'USER') as OrgRole;

@Injectable()
export class BrandsService {
  constructor(private _repo: BrandsRepository, private _posts: BrandPostsRepository) {}

  private async roles(orgId: string, userId: string, orgRole: OrgRole) {
    const rows = await this._repo.accessForUser(orgId, userId);
    const byBrand = new Map(rows.map((r) => [r.customerId, r.role as AccessRole]));
    return (customerId: string): BrandRole => resolveBrandRole(orgRole, byBrand.get(customerId));
  }

  private async mustCustomer(orgId: string, customerId: string) {
    const c = await this._repo.customer(orgId, customerId);
    if (!c) throw new NotFoundException('Brand not found');
    return c;
  }

  private mustAdmin(orgRole: OrgRole) {
    if (!isOrgAdmin(orgRole)) throw new ForbiddenException('Only an admin can change this');
  }

  // One read of everything a brand route needs: the org check, the caller's role, the approval switch, the channels.
  async context(orgId: string, userId: string, orgRole: OrgRole, customerId: string) {
    const customer = await this.mustCustomer(orgId, customerId);
    const [roleOf, settings, channels, sections] = await Promise.all([
      this.roles(orgId, userId, orgRole), this._repo.settings(orgId), this._repo.channels(orgId), this._repo.sections(orgId, customerId),
    ]);
    const rows = (k: string) => (sections.find((s) => s.key === k)?.rows as string[][] | null) || [];
    return {
      customer,
      role: roleOf(customerId),
      requiresApproval: settings.find((s) => s.customerId === customerId)?.requiresApproval ?? true,
      channels: channels.filter((c) => c.customerId === customerId),
      focusRows: rows('focus'),
      checks: rows('review').length,
    };
  }

  async list(orgId: string, userId: string, orgRole: OrgRole) {
    const [customers, channels, settings, roleOf, open] = await Promise.all([
      this._repo.customers(orgId), this._repo.channels(orgId), this._repo.settings(orgId), this.roles(orgId, userId, orgRole),
      this._posts.waiting(orgId),
    ]);
    const approval = new Map(settings.map((s) => [s.customerId, s.requiresApproval]));
    return customers.map((c) => ({
      id: c.id,
      name: c.name,
      channels: channels.filter((ch) => ch.customerId === c.id)
        .map((ch) => ({ id: ch.id, name: ch.name, provider: ch.providerIdentifier, picture: ch.picture })),
      role: roleOf(c.id),
      requiresApproval: approval.get(c.id) ?? true,
      waiting: open.filter((w) => w.customerId === c.id && (
        roleOf(c.id) === 'approve' ? w.review === 'IN_REVIEW'
          : roleOf(c.id) === 'create' ? w.review === 'SENT_BACK' && w.sentById === userId : false)).length,
    }));
  }

  async get(orgId: string, userId: string, orgRole: OrgRole, customerId: string) {
    await this.mustCustomer(orgId, customerId);
    const [brands, sections, team] = await Promise.all([
      this.list(orgId, userId, orgRole), this._repo.sections(orgId, customerId), this._repo.team(orgId),
    ]);
    const names = new Map(team.map((t) => [t.user.id, t.user.name || null]));
    return {
      ...brands.find((b) => b.id === customerId)!,
      sections: Object.fromEntries(sections.map((s) => [s.key, {
        content: s.content, rows: (s.rows as string[][] | null) ?? null, note: s.note,
        updatedBy: s.updatedById ? names.get(s.updatedById) || null : null, updatedAt: s.updatedAt.toISOString(),
      }])),
    };
  }

  async saveSection(orgId: string, userId: string, orgRole: OrgRole, customerId: string, key: string, dto: SaveSectionDto) {
    await this.mustCustomer(orgId, customerId);
    const roleOf = await this.roles(orgId, userId, orgRole);
    if (!canEdit(roleOf(customerId))) throw new ForbiddenException('You can view this brand but not change it');
    let values: { content?: string; rows?: string[][]; note?: string | null };
    try {
      if (isTextSection(key)) {
        if (dto.content === undefined || dto.content === null) throw new BadRequestException('Text is missing');
        values = { content: cleanHtml(dto.content) };
      } else if (isRowSection(key)) {
        if (!dto.rows) throw new BadRequestException('Rows are missing');
        values = {
          rows: validateRows(key, dto.rows),
          ...(typeof dto.note === 'string' ? { note: dto.note.trim() || null } : {}),
        };
      } else {
        throw new BadRequestException(`Unknown section ${key}`);
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException((e as Error).message);
    }
    return this._repo.saveSection(orgId, customerId, key, userId, values);
  }

  async getAccess(orgId: string, orgRole: OrgRole, customerId: string) {
    this.mustAdmin(orgRole);
    await this.mustCustomer(orgId, customerId);
    const [team, rows, settings] = await Promise.all([
      this._repo.team(orgId), this._repo.accessForBrand(orgId, customerId), this._repo.settings(orgId),
    ]);
    const roleOf = new Map(rows.map((r) => [r.userId, r.role]));
    return {
      requiresApproval: settings.find((s) => s.customerId === customerId)?.requiresApproval ?? true,
      people: team.map((t) => ({
        userId: t.user.id, name: t.user.name || t.user.email, orgRole: t.role,
        access: isOrgAdmin(t.role as OrgRole) ? 'APPROVE' : roleOf.get(t.user.id) || 'VIEW',
        locked: isOrgAdmin(t.role as OrgRole),
      })),
    };
  }

  async setAccess(orgId: string, orgRole: OrgRole, customerId: string, dto: SetAccessDto) {
    this.mustAdmin(orgRole);
    await this.mustCustomer(orgId, customerId);
    const member = (await this._repo.team(orgId)).find((t) => t.user.id === dto.userId);
    if (!member) throw new BadRequestException('That person is not on this team');
    return this._repo.setAccess(orgId, customerId, dto.userId, dto.role);
  }

  async setSettings(orgId: string, orgRole: OrgRole, customerId: string, dto: SetSettingsDto) {
    this.mustAdmin(orgRole);
    await this.mustCustomer(orgId, customerId);
    return this._repo.setSettings(orgId, customerId, dto.requiresApproval);
  }

  async importPlan(orgId: string, userId: string, orgRole: OrgRole, customerId: string, dto: ImportPlanDto) {
    this.mustAdmin(orgRole);
    await this.mustCustomer(orgId, customerId);
    const tz = dto.tzOffset ?? 0;
    let prepared: ReturnType<typeof prepareImport>;
    try {
      prepared = prepareImport(parsePlan(dto.html), tz);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const held = new Set((await this._repo.sections(orgId, customerId))
      .filter((s) => (s.content ?? '').trim() !== '' || (Array.isArray(s.rows) && s.rows.length > 0)).map((s) => s.key));
    const existing = await this._posts.briefs(orgId, customerId);
    const linkedRefs = new Set(existing.filter((b) => b.postId && b.planRef).map((b) => b.planRef as string));
    const taken = new Set(existing.map((b) => b.postId).filter((x): x is string => !!x));
    const links = await this.matchExisting(orgId, customerId, prepared.briefs.filter((b) => !linkedRefs.has(b.planRef)), taken, tz);
    const summary = {
      ...prepared.summary, matched: Object.keys(links).length,
      replaces: prepared.writes.map((w) => w.key).filter((k) => held.has(k)),
    };
    if (dto.dryRun) return { dryRun: true, ...summary };
    await this._repo.saveSections(orgId, customerId, userId, prepared.writes,
      prepared.briefs.map((b) => this._posts.briefUpsert(orgId, customerId, b, links[b.planRef])));
    return { dryRun: false, ...summary };
  }

  private async matchExisting(orgId: string, customerId: string, briefs: BriefWrite[], taken: Set<string>, tz: number) {
    if (!briefs.length) return {};
    const channels = (await this._repo.channels(orgId)).filter((c) => c.customerId === customerId).map((c) => c.id);
    if (!channels.length) return {};
    const times = briefs.map((b) => Date.parse(b.plannedAt));
    const posts = await this._posts.posts(orgId, channels, new Date(Math.min(...times) - 86400000),
      new Date(Math.max(...times) + 2 * 86400000), []);
    return matchPosts(briefs, posts.map((p) => ({ id: p.id, publishDate: p.publishDate.toISOString() })), taken, tz);
  }

  async pillarsByBrand(orgId: string): Promise<Record<string, string[]>> {
    const rows = await this._repo.sectionsByKey(orgId, 'pillars');
    return Object.fromEntries(rows.map((s) => [s.customerId,
      (Array.isArray(s.rows) ? (s.rows as string[][]) : []).map((r) => (r[0] || '').trim()).filter(Boolean)]));
  }
}
// <<< SANAD-BRANDS
