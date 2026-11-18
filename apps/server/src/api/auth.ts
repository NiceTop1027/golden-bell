import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loginSchema } from '@gb/shared';
import { db } from '../lib/db.ts';
import { hashPassword, newToken, sha256, verifyPassword } from '../lib/crypto.ts';
import { loginFails, reqIp } from '../lib/security.ts';
import {
  SESSION_COOKIE,
  clearLoginFailures,
  createSession,
  destroySession,
  loginLocked,
  recordLoginFailure,
  requireUser,
} from '../lib/auth.ts';

let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= hashPassword(newToken()));

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID', message: '아이디와 비밀번호를 입력해주세요' });
    const { loginId, password } = body.data;
    const ip = reqIp(req);
    const ipWait = loginFails.blocked(ip);
    if (ipWait) return reply.code(429).send({ error: 'LOCKED', message: `로그인을 너무 많이 틀렸어요. ${Math.ceil(ipWait / 60)}분 뒤에 다시 해 주세요` });
    const wait = loginLocked(loginId);
    if (wait) return reply.code(429).send({ error: 'LOCKED', message: `로그인을 5번 틀렸어요. ${Math.ceil(wait / 60)}분 뒤에 다시 해 주세요` });
    const user = await db.user.findUnique({ where: { loginId } });
    // 없는 아이디도 같은 시간이 걸리게 가짜 해시를 검사 (응답 속도로 아이디가 있는지 알아내지 못하게)
    const ok = user?.isActive ? await verifyPassword(user.passwordHash, password) : (await verifyPassword(await dummyHash(), password), false);
    if (!user || !ok) {
      recordLoginFailure(loginId);
      loginFails.hit(ip);
      return reply.code(401).send({ error: 'WRONG', message: '아이디 또는 비밀번호가 맞지 않아요' });
    }
    clearLoginFailures(loginId);
    await createSession(reply, user.id);
    return { id: user.id, name: user.name, role: user.role, loginId: user.loginId, mustChangePw: user.mustChangePw };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await destroySession(req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req, reply) => {
    const user = await requireUser(req, reply, undefined, true);
    if (!user) return;
    return user;
  });

  app.patch('/api/auth/password', async (req, reply) => {
    const user = await requireUser(req, reply, undefined, true);
    if (!user) return;
    const body = z.object({ current: z.string().min(1), next: z.string().min(8).max(200) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID', message: '새 비밀번호는 8자 이상이어야 해요' });
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(row.passwordHash, body.data.current))) {
      return reply.code(400).send({ error: 'WRONG', message: '지금 비밀번호가 맞지 않아요' });
    }
    if (body.data.current === body.data.next) {
      return reply.code(400).send({ error: 'SAME', message: '지금과 다른 비밀번호를 써 주세요' });
    }
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.data.next), mustChangePw: false } });
    // 다른 기기의 세션은 끊고 지금 세션만 남김
    const current = req.cookies[SESSION_COOKIE];
    await db.session.deleteMany({ where: { userId: user.id, NOT: { id: current ? sha256(current) : '' } } });
    return { ok: true };
  });
}
