// >>> SANAD-BRANDS: every query is scoped by orgId; writes to another org's customer are impossible because the
// service loads the customer with { id, orgId } first.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class BrandsRepository {
  constructor(
    private _prisma: PrismaRepository<'brandSection' | 'brandAccess' | 'brandSettings' | 'customer' | 'integration' | 'userOrganization' | '$transaction'>
  ) {}

  customers(orgId: string) {
    return this._prisma.model.customer.findMany({ where: { orgId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
  }

  customer(orgId: string, id: string) {
    return this._prisma.model.customer.findFirst({ where: { id, orgId, deletedAt: null } });
  }

  channels(orgId: string) {
    return this._prisma.model.integration.findMany({
      where: { organizationId: orgId, deletedAt: null, disabled: false },
      select: { id: true, name: true, providerIdentifier: true, picture: true, customerId: true },
    });
  }

  sections(orgId: string, customerId: string) {
    return this._prisma.model.brandSection.findMany({ where: { orgId, customerId } });
  }

  private sectionUpsert(orgId: string, customerId: string, userId: string,
    key: string, data: { content?: string | null; rows?: string[][] | null; note?: string | null }) {
    const values = {
      ...(data.content !== undefined ? { content: data.content } : {}),
      ...(data.rows !== undefined ? { rows: data.rows === null ? Prisma.JsonNull : data.rows } : {}),
      ...(data.note !== undefined ? { note: data.note } : {}),
      updatedById: userId,
    };
    return this._prisma.model.brandSection.upsert({
      where: { customerId_key: { customerId, key } },
      create: { orgId, customerId, key, ...values },
      update: values,
    });
  }

  saveSection(orgId: string, customerId: string, key: string, userId: string,
    data: { content?: string | null; rows?: string[][] | null; note?: string | null }) {
    return this.sectionUpsert(orgId, customerId, userId, key, data);
  }

  saveSections(orgId: string, customerId: string, userId: string,
    writes: { key: string; content?: string; rows?: string[][]; note?: string | null }[],
    extra: Prisma.PrismaPromise<unknown>[] = []) {
    return this._prisma.model.$transaction([
      ...writes.map(({ key, ...data }) => this.sectionUpsert(orgId, customerId, userId, key, data)),
      ...extra,
    ]);
  }

  accessForUser(orgId: string, userId: string) {
    return this._prisma.model.brandAccess.findMany({ where: { orgId, userId } });
  }

  accessForBrand(orgId: string, customerId: string) {
    return this._prisma.model.brandAccess.findMany({ where: { orgId, customerId } });
  }

  setAccess(orgId: string, customerId: string, userId: string, role: string) {
    return this._prisma.model.brandAccess.upsert({
      where: { customerId_userId: { customerId, userId } },
      create: { orgId, customerId, userId, role },
      update: { role },
    });
  }

  settings(orgId: string) {
    return this._prisma.model.brandSettings.findMany({ where: { orgId } });
  }

  setSettings(orgId: string, customerId: string, requiresApproval: boolean) {
    return this._prisma.model.brandSettings.upsert({
      where: { customerId },
      create: { orgId, customerId, requiresApproval },
      update: { requiresApproval },
    });
  }

  team(orgId: string) {
    return this._prisma.model.userOrganization.findMany({
      where: { organizationId: orgId, disabled: false },
      select: { role: true, user: { select: { id: true, name: true, email: true } } },
    });
  }

  sectionsByKey(orgId: string, key: string) {
    return this._prisma.model.brandSection.findMany({ where: { orgId, key }, select: { customerId: true, rows: true } });
  }
}
// <<< SANAD-BRANDS
