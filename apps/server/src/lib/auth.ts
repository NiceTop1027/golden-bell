// 계획서 5.1: 서버 세션 쿠키 (httpOnly, Secure, SameSite=Lax), 5회 실패 시 5분 잠금
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from './db.ts';
import { newToken, sha256 } from './crypto.ts';
import { env } from './env.ts';

export const SESSION_COOKIE = 'gb_sid';
const SESSION_MS = 12 * 60 * 60 * 1000;

export type AuthUser = { id: string; name: string; role: 'ADMIN' | 'TEACHER'; loginId: string; mustChangePw: boolean };

export async function createSession(reply: FastifyReply, userId: string) {
  const token = newToken();
  await db.session.create({ data: { id: sha256(token), userId, expiresAt: new Date(Date.now() + SESSION_MS) } });
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MS / 1000,
  });
}

export async function userFromToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const s = await db.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || !s.user.isActive) return null;
  const u = s.user;
  return { id: u.id, name: u.name, role: u.role, loginId: u.loginId, mustChangePw: u.mustChangePw };
}

export async function destroySession(token: string | undefined) {
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply, role?: 'ADMIN', allowMustChangePw = false) {
  const user = await userFromToken(req.cookies[SESSION_COOKIE]);
  if (!user) {
    reply.code(401).send({ error: 'UNAUTHORIZED', message: '로그인이 필요해요' });
    return null;
  }
  // 첫 로그인 때 비밀번호 변경 강제 (5.1)
  if (user.mustChangePw && !allowMustChangePw) {
    reply.code(403).send({ error: 'MUST_CHANGE_PW', message: '먼저 비밀번호를 바꿔 주세요' });
    return null;
  }
  if (role && user.role !== role) {
    reply.code(403).send({ error: 'FORBIDDEN', message: '권한이 없어요' });
    return null;
  }
  return user;
}

/**
 * 선생님과 관리자는 대회·문제·검수·과목 권한이 같다 (2026-11-17 결정).
 * 관리자만 따로 하는 일은 선생님 계정 관리(만들기·끄기·비밀번호 초기화)뿐 → requireUser(..., 'ADMIN')
 */
export const hasStaffPower = (user: Pick<AuthUser, 'role'>) => user.role === 'ADMIN' || user.role === 'TEACHER';

/** 대회 진행·관리 권한: 로그인한 선생님·관리자 누구나 */
export async function canHost(user: AuthUser, _contestId: string) {
  return hasStaffPower(user);
}

// 아이디별 로그인 실패 잠금
const failures = new Map<string, { count: number; until: number }>();
export function loginLocked(loginId: string): number {
  const f = failures.get(loginId);
  if (f && f.until > Date.now()) return Math.ceil((f.until - Date.now()) / 1000);
  return 0;
}
export function recordLoginFailure(loginId: string) {
  const f = failures.get(loginId) ?? { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= 5) {
    f.until = Date.now() + 5 * 60 * 1000;
    f.count = 0;
  }
  failures.set(loginId, f);
  // 없는 아이디를 계속 넣어 메모리를 채우지 못하게: 잠금이 끝난 것부터 정리
  if (failures.size > 10_000) {
    const now = Date.now();
    for (const [k, v] of failures) if (v.until <= now) failures.delete(k);
    while (failures.size > 10_000) failures.delete(failures.keys().next().value!);
  }
}
export const clearLoginFailures = (loginId: string) => failures.delete(loginId);
