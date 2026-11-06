import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { HttpError, joinCode, me, ok, requireMember, wrap } from '../util';

export const groupsRouter = Router();

groupsRouter.get('/', wrap(async (_req, res) => {
  const rows = ok(await db.from('group_members').select('role, groups(id,name,description,join_code)').eq('user_id', me(res)));
  res.json(rows.map((r: any) => ({ ...r.groups, role: r.role })));
}));

groupsRouter.post('/', wrap(async (req, res) => {
  const body = z.object({ name: z.string().trim().min(2).max(100), description: z.string().max(500).nullish() }).parse(req.body);
  for (let i = 0; i < 5; i++) {
    const { data, error } = await db.from('groups').insert({ name: body.name, description: body.description ?? null, join_code: joinCode(), created_by: me(res) }).select().single();
    if (error?.code === '23505') continue; // join_code collision, retry
    if (error) throw new HttpError(500, 'Qrup yaradıla bilmədi');
    ok(await db.from('group_members').insert({ group_id: data.id, user_id: me(res), role: 'owner' }));
    return res.status(201).json(data);
  }
  throw new HttpError(500, 'Qrup yaradıla bilmədi');
}));

groupsRouter.post('/join', wrap(async (req, res) => {
  const { code } = z.object({ code: z.string().trim().min(4).max(20) }).parse(req.body);
  const group = ok(await db.from('groups').select('id,name').eq('join_code', code.toUpperCase()).maybeSingle());
  if (!group) throw new HttpError(404, 'Bu kodla qrup tapılmadı');
  await db.from('group_members').upsert({ group_id: group.id, user_id: me(res), role: 'member' }, { onConflict: 'group_id,user_id', ignoreDuplicates: true });
  res.json(group);
}));

groupsRouter.get('/:id', wrap(async (req, res) => {
  const gid = req.params.id;
  const role = await requireMember(gid, me(res));
  const group = ok(await db.from('groups').select('id,name,description,join_code').eq('id', gid).single());
  const members = ok(await db.from('group_members').select('user_id,role,joined_at,profiles(display_name)').eq('group_id', gid));
  const exams = ok(await db.from('exams').select('id,title,description,time_limit_minutes,created_by,created_at,questions(type)').eq('group_id', gid).order('created_at', { ascending: false }));
  const names = new Map<string, string>(members.map((m: any) => [m.user_id, m.profiles?.display_name ?? '']));
  res.json({
    group, role, my_id: me(res),
    members: members.map((m: any) => ({ user_id: m.user_id, role: m.role, display_name: m.profiles?.display_name ?? '' })),
    exams: exams.map((e: any) => ({
      id: e.id, title: e.title, description: e.description, time_limit_minutes: e.time_limit_minutes,
      created_by: e.created_by, creator_name: names.get(e.created_by) ?? '', created_at: e.created_at,
      mcq_count: e.questions.filter((q: any) => q.type === 'mcq').length,
      written_count: e.questions.filter((q: any) => q.type === 'written').length,
    })),
  });
}));

groupsRouter.delete('/:id/members/:userId', wrap(async (req, res) => {
  const role = await requireMember(req.params.id, me(res));
  const target = req.params.userId;
  if (role !== 'owner' && target !== me(res)) throw new HttpError(403, 'Yalnız qrup sahibi üzvü çıxara bilər');
  const t = ok(await db.from('group_members').select('role').eq('group_id', req.params.id).eq('user_id', target).maybeSingle());
  if (t?.role === 'owner') throw new HttpError(400, 'Qrup sahibi çıxarıla bilməz');
  ok(await db.from('group_members').delete().eq('group_id', req.params.id).eq('user_id', target));
  res.json({ ok: true });
}));
