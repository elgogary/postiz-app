// >>> SANAD-BRANDS: what the Brands MCP tools share. Every tool acts as the person behind the OAuth token, with their
// own org role, so the Brands services apply the same rights and records as the screens.
import { HttpException, Logger } from '@nestjs/common';
import z from 'zod';
import { getAuth, getUser } from '@gitroom/nestjs-libraries/chat/async.storage';
import type { OrgRole } from '@gitroom/helpers/brands/brand.rules';

// A refusal written for the person (no right, a missing reason): its text goes back to Claude as it is
export class Refusal extends Error {}

const log = new Logger('BrandsMcpTools');
export const ID = z.string().min(1).max(64);

export const NO_PERSON = 'The Brands tools act as a person. Connect Claude to the Marketing Hub with your own login '
  + '(the OAuth connector), not with the organisation API key.';

export type Person = { orgId: string; userId: string; role: OrgRole };

export const person = (): Person => {
  const user = getUser();
  const org = getAuth<{ id?: string }>();
  if (!user || !org?.id) throw new Refusal(NO_PERSON);
  return { orgId: org.id, userId: user.id, role: user.role };
};

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');

// The brand by id or by name (case and spaces ignored), among the brands this person can see.
export const pickBrand = <T extends { id: string; name: string }>(brands: T[], ref: string): T => {
  const byId = brands.find((b) => b.id === ref.trim());
  if (byId) return byId;
  const named = brands.filter((b) => norm(b.name) === norm(ref));
  if (named.length > 1) throw new Refusal(`${named.length} brands are called "${ref}": use the id (${named.map((b) => b.id).join(', ')})`);
  if (!named.length) throw new Refusal(`No brand "${ref}". Your brands: ${brands.map((b) => b.name).join(', ')}`);
  return named[0];
};

// Brand-book HTML as plain text: one line per paragraph, heading or list item, cut at `max` characters.
export const plain = (html: string | null | undefined, max = 2000) => {
  const text = (html || '')
    .replace(/<\/(p|li|h3|h4|div)>|<br\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '- ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

// What the person may read: the services' own refusals (HTTP errors) and the tools' Refusal. Anything else (a database
// or driver error) is logged and comes back as a plain message, never its internal text.
export const message = (e: unknown) => {
  if (e instanceof HttpException || e instanceof Refusal) return e.message;
  log.error(`Brands tool failed: ${(e as Error)?.stack || e}`);
  return 'Something went wrong on the Marketing Hub. Check the brand there before trying again.';
};

// A tool's answer: the result, or the refusal or error as a message Claude can show the person.
export const answer = async <T>(fn: () => Promise<T>): Promise<T | { error: string }> => {
  try {
    return await fn();
  } catch (e) {
    return { error: message(e) };
  }
};

export const BRAND_ARG = 'Brand name or id, for example "Accurate Systems"';
export const STATES = 'planned (not drafted yet), draft, review (waiting for approval), changes (sent back), '
  + 'scheduled, published, error';
// <<< SANAD-BRANDS
