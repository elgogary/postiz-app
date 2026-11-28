// >>> SANAD-BRANDS: trends: the weekly rows of one organization. Every query is scoped by orgId.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

export type TrendWrite = Omit<Prisma.BrandTrendUncheckedCreateInput, 'orgId' | 'customerId' | 'week' | 'ideaId' | 'id' | 'createdAt'>;

@Injectable()
export class BrandTrendsRepository {
  constructor(private _prisma: PrismaRepository<'brandTrend' | 'brandSection' | '$transaction'>) {}

  // Organizations that wrote a pillars section: the only ones the weekly run can cover.
  async orgsWithPillars(): Promise<string[]> {
    const rows = await this._prisma.model.brandSection.findMany({ where: { key: 'pillars' }, select: { orgId: true }, distinct: ['orgId'] });
    return rows.map((r) => r.orgId);
  }

  // One brand, one week: upsert the new set, then remove the rows left over unless an idea was made from them.
  async saveWeek(orgId: string, customerId: string, week: Date, rows: TrendWrite[]) {
    const upserts = rows.map(({ key, ...data }) => this._prisma.model.brandTrend.upsert({
      where: { orgId_customerId_week_key: { orgId, customerId, week, key } },
      create: { ...data, key, orgId, customerId, week },
      update: data,
    }));
    const removal = this._prisma.model.brandTrend.deleteMany({
      where: { orgId, customerId, week, ideaId: null, key: { notIn: rows.map((r) => r.key) } },
    });
    await this._prisma.model.$transaction([...upserts, removal]);
  }

  async latestWeek(orgId: string, brandIds: string[]): Promise<Date | null> {
    if (!brandIds.length) return null;
    const r = await this._prisma.model.brandTrend.findFirst({
      where: { orgId, customerId: { in: brandIds } }, orderBy: { week: 'desc' }, select: { week: true },
    });
    return r?.week || null;
  }

  rows(orgId: string, week: Date, brandIds: string[]) {
    return this._prisma.model.brandTrend.findMany({ where: { orgId, week, customerId: { in: brandIds } }, orderBy: { score: 'desc' } });
  }

  row(orgId: string, id: string) {
    return this._prisma.model.brandTrend.findFirst({ where: { id, orgId } });
  }

  // Sets the idea only while none is set, so two clicks never leave two ideas on one row.
  async claimIdea(orgId: string, id: string, ideaId: string) {
    const r = await this._prisma.model.brandTrend.updateMany({ where: { id, orgId, ideaId: null }, data: { ideaId } });
    return r.count === 1;
  }
}
// <<< SANAD-BRANDS
