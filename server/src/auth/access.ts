import { db } from '../store/db.js';
import type { Doc, Role, Space, User } from '../types.js';

export type Capability =
  | 'workspace.manage' | 'users.manage' | 'spaces.manage' | 'ai.configure'
  | 'sources.write' | 'quality.run' | 'ask' | 'search' | 'view';

export const ROLE_CAPS: Record<Role, Capability[]> = {
  owner: ['workspace.manage', 'users.manage', 'spaces.manage', 'ai.configure', 'sources.write', 'quality.run', 'ask', 'search', 'view'],
  admin: ['users.manage', 'spaces.manage', 'ai.configure', 'sources.write', 'quality.run', 'ask', 'search', 'view'],
  knowledge_manager: ['sources.write', 'quality.run', 'ask', 'search', 'view'],
  member: ['ask', 'search', 'view'],
  viewer: ['view'],
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Workspace Owner', admin: 'Admin', knowledge_manager: 'Knowledge Manager', member: 'Member', viewer: 'Viewer',
};

export const can = (u: User, cap: Capability) => ROLE_CAPS[u.role].includes(cap);
const isPrivileged = (u: User) => u.role === 'owner' || u.role === 'admin';

export function canAccessSpace(u: User, s: Space) {
  return isPrivileged(u) || s.accessTeams.includes('*') || s.accessTeams.some((t) => u.teams.includes(t));
}

export function accessibleSpaces(u: User) {
  return db.spaces.find((s) => canAccessSpace(u, s));
}

export function canAccessDoc(u: User, d: Doc, spaces = new Map(db.spaces.all().map((s) => [s.id, s]))) {
  const space = spaces.get(d.spaceId);
  if (!space || !canAccessSpace(u, space)) return false;
  if (d.visibility === 'private') return d.ownerId === u.id || isPrivileged(u);
  return true;
}

/**
 * The permission boundary for retrieval. Called *before* any vector or keyword
 * search so that unauthorised chunks are never scored, ranked or sent to an LLM.
 */
export function accessibleDocIds(u: User, scope?: { docIds?: string[]; spaceIds?: string[]; readyOnly?: boolean }) {
  const spaces = new Map(db.spaces.all().map((s) => [s.id, s]));
  const wantDocs = scope?.docIds?.length ? new Set(scope.docIds) : null;
  const wantSpaces = scope?.spaceIds?.length ? new Set(scope.spaceIds) : null;
  return db.docs
    .find((d) => (scope?.readyOnly === false || d.status === 'ready')
      && (!wantDocs || wantDocs.has(d.id))
      && (!wantSpaces || wantSpaces.has(d.spaceId))
      && canAccessDoc(u, d, spaces))
    .map((d) => d.id);
}
