// 계획서 5.1·SC-06: 관리자가 선생님 계정을 일괄 생성·비활성화·비밀번호 초기화
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { type TeacherDTO, teacherCreateSchema } from '@gb/shared';
import { db } from '../lib/db.ts';
import { hashPassword } from '../lib/crypto.ts';
import { requireUser } from '../lib/auth.ts';

/** 처음 비밀번호: 헷갈리는 글자(0 O 1 l I)를 뺀 10자 */
function tempPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...randomBytes(10)].map((b) => chars[b % chars.length]).join('');
}

export async function teacherRoutes(app: FastifyInstance) {
  app.get('/api/admin/teachers', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const rows = await db.user.findMany({
      where: { role: 'TEACHER' },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { questions: true } } },
    });
    const res: TeacherDTO[] = rows.map((u) => ({
      id: u.id,
      loginId: u.loginId,
      name: u.name,
      subject: u.subject,
      isActive: u.isActive,
      mustChangePw: u.mustChangePw,
      questionCount: u._count.questions,
      createdAt: u.createdAt.toISOString(),
    }));
    return res;
  });

  app.post('/api/admin/teachers', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const body = teacherCreateSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID', message: body.error.issues[0]?.message ?? '입력을 확인해 주세요' });
    const ids = body.data.teachers.map((t) => t.loginId);
    const dup = ids.find((id, i) => ids.indexOf(id) !== i);
    if (dup) return reply.code(400).send({ error: 'DUPLICATE', message: `아이디 ${dup}가 두 번 들어 있어요` });
    const taken = await db.user.findMany({ where: { loginId: { in: ids } }, select: { loginId: true } });
    if (taken.length) return reply.code(409).send({ error: 'TAKEN', message: `이미 있는 아이디예요: ${taken.map((t) => t.loginId).join(', ')}` });
    const created: { name: string; loginId: string; initialPassword: string }[] = [];
    for (const t of body.data.teachers) {
      const pw = tempPassword();
      await db.user.create({
        data: { loginId: t.loginId, name: t.name, subject: t.subject || null, role: 'TEACHER', passwordHash: await hashPassword(pw), mustChangePw: true },
      });
      created.push({ name: t.name, loginId: t.loginId, initialPassword: pw });
    }
    // 처음 비밀번호는 이 응답에서 한 번만 보여 줌 (DB에는 해시만)
    return reply.code(201).send({ created });
  });

  app.patch<{ Params: { id: string } }>('/api/admin/teachers/:id', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const body = z
      .object({
        isActive: z.boolean().optional(),
        resetPassword: z.literal(true).optional(),
        name: z.string().trim().min(1).max(20).optional(),
        subject: z.string().trim().max(20).nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success || !z.string().uuid().safeParse(req.params.id).success) return reply.code(400).send({ error: 'INVALID', message: '입력을 확인해 주세요' });
    const t = await db.user.findFirst({ where: { id: req.params.id, role: 'TEACHER' } });
    if (!t) return reply.code(404).send({ error: 'NOT_FOUND', message: '선생님 계정을 찾을 수 없어요' });
    const d = body.data;
    let initialPassword: string | undefined;
    const data: Parameters<typeof db.user.update>[0]['data'] = {};
    if (d.isActive !== undefined) data.isActive = d.isActive;
    if (d.name !== undefined) data.name = d.name;
    if (d.subject !== undefined) data.subject = d.subject || null;
    if (d.resetPassword) {
      initialPassword = tempPassword();
      data.passwordHash = await hashPassword(initialPassword);
      data.mustChangePw = true;
    }
    await db.user.update({ where: { id: t.id }, data });
    // 비활성화·비밀번호 초기화하면 로그인 세션을 끊음
    if (d.isActive === false || d.resetPassword) await db.session.deleteMany({ where: { userId: t.id } });
    return { ok: true, initialPassword };
  });
}
