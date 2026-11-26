// >>> SANAD-BRANDS
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BrandsRepository } from '@gitroom/nestjs-libraries/database/prisma/brands/brands.repository';
import { ImportPlanDto, SaveSectionDto, SetAccessDto, SetSettingsDto } from '@gitroom/nestjs-libraries/dtos/brands/brands.dto';
import {
  AccessRole, BrandRole, OrgRole, canEdit, cleanHtml, isOrgAdmin, isRowSection, isTextSection, resolveBrandRole, validateRows,
} from '@gitroom/helpers/brands/brand.rules';
import { parsePlan } from '@gitroom/helpers/brands/plan.parser';
import { prepareImport } from '@gitroom/helpers/brands/plan.import';

export const orgRoleOf = (org: unknown): OrgRole =>
  ((org as { users?: { role?: OrgRole }[] })?.users?.[0]?.role || 'USER') as OrgRole;

@Injectable()
export class BrandsService {
  constructor(private _repo: BrandsRepository) {}

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

  async list(orgId: string, userId: string, orgRole: OrgRole) {
    const [customers, channels, settings, roleOf] = await Promise.all([
      this._repo.customers(orgId), this._repo.channels(orgId), this._repo.settings(orgId), this.roles(orgId, userId, orgRole),
    ]);
    const approval = new Map(settings.map((s) => [s.customerId, s.requiresApproval]));
    return customers.map((c) => ({
      id: c.id,
      name: c.name,
      channels: channels.filter((ch) => ch.customerId === c.id)
        .map((ch) => ({ id: ch.id, name: ch.name, provider: ch.providerIdentifier, picture: ch.picture })),
      role: roleOf(c.id),
      requiresApproval: approval.get(c.id) ?? true,
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
    let prepared: ReturnType<typeof prepareImport>;
    try {
      prepared = prepareImport(parsePlan(dto.html));
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (dto.dryRun) return { dryRun: true, ...prepared.summary };
    await this._repo.saveSections(orgId, customerId, userId, prepared.writes);
    return { dryRun: false, ...prepared.summary };
  }
}
// <<< SANAD-BRANDS
