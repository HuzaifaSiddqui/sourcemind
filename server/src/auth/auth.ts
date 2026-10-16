import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { db } from '../store/db.js';
import type { PublicUser, User } from '../types.js';
import { can, type Capability } from './access.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: User } }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const signToken = (u: User) => jwt.sign({ sub: u.id }, config.jwtSecret, { expiresIn: '7d' });

export function publicUser(u: User): PublicUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role, teams: u.teams, title: u.title, color: u.color };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : (req.query.token as string | undefined);
  if (!token) throw new HttpError(401, 'Authentication required');
  try {
    const { sub } = jwt.verify(token, config.jwtSecret) as { sub: string };
    const user = db.users.get(sub);
    if (!user) throw new Error();
    req.user = user;
    next();
  } catch {
    throw new HttpError(401, 'Session expired — please sign in again');
  }
}

export const requireCap = (cap: Capability) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user || !can(req.user, cap)) throw new HttpError(403, `Your role does not allow this action (${cap})`);
  next();
};

export function audit(userId: string, action: string, target: string, meta?: Record<string, unknown>) {
  db.audit.insert({ id: nanoid(12), at: new Date().toISOString(), userId, action, target, meta });
}
