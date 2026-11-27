// >>> SANAD-BRANDS: who is calling the MCP server. A person's OAuth token ('pos_') carries the person who allowed it,
// and their role comes from their membership of that organisation (a switched-off membership is refused). An API key
// is the organisation only: no person, so the Brands tools refuse it.
import type { OrgRole } from '@gitroom/helpers/brands/brand.rules';

export type McpUser = { id: string; role: OrgRole };
export type McpIdentity = { org: any; user?: McpUser };

type Membership = { id: string; users?: { role: OrgRole; disabled: boolean }[] };
export type McpIdentityDeps = {
  byOAuthToken: (token: string) => Promise<{ organization?: any; user?: { id: string } } | null | undefined>;
  byApiKey: (key: string) => Promise<any>;
  orgsOfUser: (userId: string) => Promise<Membership[]>;
};

export const resolveMcpIdentity = async (token: string, deps: McpIdentityDeps): Promise<McpIdentity | null> => {
  if (!token.startsWith('pos_')) {
    const org = await deps.byApiKey(token);
    return org ? { org } : null;
  }
  const auth = await deps.byOAuthToken(token);
  if (!auth?.organization || !auth.user?.id) return null;
  const member = (await deps.orgsOfUser(auth.user.id)).find((o) => o.id === auth.organization.id)?.users?.[0];
  if (!member || member.disabled) return null;
  return { org: auth.organization, user: { id: auth.user.id, role: member.role } };
};
// <<< SANAD-BRANDS
