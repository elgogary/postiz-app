// context.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import type { McpUser } from './mcp.identity';

type Ctx = {
  requestId: string;
  auth: any; // replace with your org type if you have it, e.g. Organization
  user?: McpUser; // SANAD-BRANDS: the person behind an OAuth token; none for an API key
};

const als = new AsyncLocalStorage<Ctx>();

export function runWithContext<T>(ctx: Ctx, fn: () => Promise<T> | T) {
  return als.run(ctx, fn);
}

export function getContext(): Ctx | undefined {
  return als.getStore();
}

export function getAuth<T = any>(): T | undefined {
  return als.getStore()?.auth as T | undefined;
}

// SANAD-BRANDS
export function getUser(): McpUser | undefined {
  return als.getStore()?.user;
}

export function getRequestId(): string | undefined {
  return als.getStore()?.requestId;
}