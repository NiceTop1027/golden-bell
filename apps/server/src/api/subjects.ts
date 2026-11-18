// 과목 관리: 관리자가 추가·이름 바꾸기·묶음 바꾸기·순서·삭제. 문제는 과목 이름을 글자로 가지므로
// 이름을 바꾸면 그 과목을 쓰는 문제(와 선생님 담당 과목)도 같은 트랜잭션에서 함께 바꾼다.
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { type SubjectDTO, subjectCreateSchema, subjectGroupRenameSchema, subjectOrderSchema, subjectUpdateSchema } from '@gb/shared';
import { db } from '../lib/db.ts';
import { requireUser } from '../lib/auth.ts';

const err = (reply: FastifyReply, code: number, error: string, message: string) => reply.code(code).send({ error, message });
const isUuid = (s: string) => z.string().uuid().safeParse(s).success;

/** 순서대로 정렬한 과목 목록 + 과목별 문제 수 */
export async function listSubjects(): Promise<SubjectDTO[]> {
  const [rows, counts] = await Promise.all([
    db.subject.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    db.question.groupBy({ by: ['subject'], _count: true }),
  ]);
  const n = new Map(counts.map((c) => [c.subject, c._count]));
  return rows.map((r) => ({ id: r.id, name: r.name, group: r.group, questionCount: n.get(r.name) ?? 0 }));
}

/** 과목 이름이 목록에 있는지 (문제 저장·엑셀 검사용) */
export async function subjectExists(name: string) {
  return (await db.subject.count({ where: { name } })) > 0;
}

/** 묶음이 흩어지지 않게: 묶음은 처음 나온 순서대로, 묶음 안은 지금 순서대로 0..n 다시 매김 */
async function renumber(orderedIds?: string[]) {
  const rows = await db.subject.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  let list = rows;
  if (orderedIds) {
    const pos = new Map(orderedIds.map((id, i) => [id, i]));
    list = [...rows].sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
  }
  const groups: string[] = [];
  for (const r of list) if (!groups.includes(r.group)) groups.push(r.group);
  const ordered = groups.flatMap((g) => list.filter((r) => r.group === g));
  await db.$transaction(ordered.map((r, i) => db.subject.update({ where: { id: r.id }, data: { sortOrder: i } })));
}

/** id를 묶음 group의 맨 뒤(없는 묶음이면 전체 맨 뒤)로 옮기고 번호를 다시 매김 */
async function placeAtGroupEnd(id: string, group: string) {
  const rows = await db.subject.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  const ids = rows.map((r) => r.id).filter((x) => x !== id);
  const tail = rows.filter((r) => r.group === group && r.id !== id).at(-1);
  ids.splice(tail ? ids.indexOf(tail.id) + 1 : ids.length, 0, id);
  await renumber(ids);
}

export async function subjectRoutes(app: FastifyInstance) {
  // 문제 쓰는 선생님도 고를 수 있어야 하므로 로그인한 누구나
  app.get('/api/subjects', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    return listSubjects();
  });

  app.post('/api/subjects', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const body = subjectCreateSchema.safeParse(req.body);
    if (!body.success) return err(reply, 400, 'INVALID', body.error.issues[0]?.message ?? '입력을 확인해 주세요');
    const { name, group } = body.data;
    if (await subjectExists(name)) return err(reply, 409, 'DUPLICATE', `"${name}"은 이미 있는 과목이에요`);
    // 같은 묶음의 맨 뒤에 넣고, 새 묶음이면 전체 맨 뒤
    const created = await db.subject.create({ data: { name, group, sortOrder: 1_000_000 } });
    await placeAtGroupEnd(created.id, group);
    return { id: created.id };
  });

  app.patch<{ Params: { id: string } }>('/api/subjects/:id', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!isUuid(req.params.id)) return err(reply, 404, 'NOT_FOUND', '과목을 찾을 수 없어요');
    const s = await db.subject.findUnique({ where: { id: req.params.id } });
    if (!s) return err(reply, 404, 'NOT_FOUND', '과목을 찾을 수 없어요');
    const body = subjectUpdateSchema.safeParse(req.body);
    if (!body.success) return err(reply, 400, 'INVALID', body.error.issues[0]?.message ?? '입력을 확인해 주세요');
    const name = body.data.name ?? s.name;
    const group = body.data.group ?? s.group;
    if (name !== s.name && (await subjectExists(name))) return err(reply, 409, 'DUPLICATE', `"${name}"은 이미 있는 과목이에요`);
    const [, renamedQuestions] = await db.$transaction([
      db.subject.update({ where: { id: s.id }, data: { name, group } }),
      db.question.updateMany({ where: { subject: s.name }, data: { subject: name } }),
      db.user.updateMany({ where: { subject: s.name }, data: { subject: name } }),
    ]);
    // 묶음을 옮기면 그 묶음 맨 뒤로
    if (group !== s.group) await placeAtGroupEnd(s.id, group);
    return { ok: true, renamedQuestions: name !== s.name ? renamedQuestions.count : 0 };
  });

  app.delete<{ Params: { id: string } }>('/api/subjects/:id', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!isUuid(req.params.id)) return err(reply, 404, 'NOT_FOUND', '과목을 찾을 수 없어요');
    const s = await db.subject.findUnique({ where: { id: req.params.id } });
    if (!s) return err(reply, 404, 'NOT_FOUND', '과목을 찾을 수 없어요');
    const used = await db.question.count({ where: { subject: s.name } });
    if (used > 0) return err(reply, 409, 'IN_USE', `${used}문제가 "${s.name}" 과목을 쓰고 있어 지울 수 없어요. 이름을 바꾸거나 문제의 과목을 먼저 바꿔 주세요`);
    if ((await db.subject.count()) <= 1) return err(reply, 409, 'LAST', '과목이 하나는 있어야 해요');
    await db.subject.delete({ where: { id: s.id } });
    await renumber();
    return { ok: true };
  });

  app.put('/api/subjects/order', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const body = subjectOrderSchema.safeParse(req.body);
    if (!body.success) return err(reply, 400, 'INVALID', '순서를 확인해 주세요');
    await renumber(body.data.ids);
    return listSubjects();
  });

  app.put('/api/subjects/group', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const body = subjectGroupRenameSchema.safeParse(req.body);
    if (!body.success) return err(reply, 400, 'INVALID', body.error.issues[0]?.message ?? '입력을 확인해 주세요');
    const { from, to } = body.data;
    if (from === to) return { ok: true };
    if ((await db.subject.count({ where: { group: from } })) === 0) return err(reply, 404, 'NOT_FOUND', '묶음을 찾을 수 없어요');
    // 이미 있는 묶음 이름이면 두 묶음이 합쳐짐
    await db.subject.updateMany({ where: { group: from }, data: { group: to } });
    await renumber();
    return { ok: true };
  });
}
