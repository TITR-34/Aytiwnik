import crypto from 'crypto';
import type { Request, Response, RequestHandler } from 'express';
import { db } from './db';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export const me = (res: Response) => res.locals.userId as string;

/** Unwraps a Supabase response; logs the real error, returns a generic one to the client. */
export function ok(r: { data: any; error: any }): any {
  if (r.error) {
    console.error('DB error:', r.error.message);
    throw new HttpError(500, 'Server xətası');
  }
  return r.data;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Shuffles options but keeps each option's id, so the answer key stays valid. */
export function shuffleOptions<T extends { id: string }>(options: T[]): T[] {
  return shuffle(options);
}

/** Clamp AI points into [0, max], rounded to 0.5. */
export function clampPoints(v: unknown, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(0, Math.round(n * 2) / 2));
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function joinCode(len = 8): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return s;
}

export async function requireMember(groupId: string, userId: string): Promise<'owner' | 'member'> {
  const data = ok(
    await db.from('group_members').select('role').eq('group_id', groupId).eq('user_id', userId).maybeSingle(),
  );
  if (!data) throw new HttpError(403, 'Bu qrupa çıxışınız yoxdur');
  return data.role;
}
