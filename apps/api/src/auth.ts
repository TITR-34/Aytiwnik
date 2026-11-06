import type { RequestHandler } from 'express';
import { db } from './db';

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Giriş tələb olunur' });
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Sessiya etibarsızdır' });
    res.locals.userId = data.user.id;
    next();
  } catch (e) {
    next(e);
  }
};
