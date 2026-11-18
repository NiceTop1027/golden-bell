// 보안 공통: 실제 접속 IP, 횟수 제한, 다른 사이트에서 보낸 요청 막기, 응답 보안 헤더
import type { IncomingHttpHeaders } from 'node:http';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from './env.ts';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * 요청한 사람의 IP. 같은 컴퓨터의 cloudflared를 거쳐 온 요청만 Cloudflare가 붙인 진짜 IP를 믿고,
 * 그 밖에는 연결 주소를 씀 (학생이 헤더를 꾸며 횟수 제한을 피하지 못하게)
 */
export function clientIp(remote: string | undefined, headers: IncomingHttpHeaders): string {
  const addr = remote ?? '';
  if (LOOPBACK.has(addr)) {
    const cf = headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.length <= 64) return cf;
  }
  return addr;
}
export const reqIp = (req: FastifyRequest) => clientIp(req.socket.remoteAddress, req.headers);

/** 고정 창 횟수 제한: 같은 key는 windowMs 동안 limit번까지 */
export function limiter(limit: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return {
    /** 막혔으면 풀릴 때까지 남은 초, 아니면 0 */
    blocked(key: string) {
      const h = hits.get(key);
      const now = Date.now();
      return h && h.reset > now && h.n >= limit ? Math.ceil((h.reset - now) / 1000) : 0;
    },
    hit(key: string) {
      const now = Date.now();
      let h = hits.get(key);
      if (!h || h.reset <= now) {
        h = { n: 0, reset: now + windowMs };
        hits.set(key, h);
      }
      h.n += 1;
      // 아무 값이나 계속 넣어 메모리를 채우지 못하게
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
        while (hits.size > 10_000) hits.delete(hits.keys().next().value!);
      }
    },
  };
}

/** 틀린 대회 코드로 참가 시도: 한 IP(학교 와이파이 전체가 한 IP일 수 있음)에서 10분에 120번까지 → 코드 찍어 맞히기 방지 */
export const joinCodeFails = limiter(120, 10 * 60_000);
/**
 * 참가 화면의 코드 미리 확인(제목 보기)은 지난 대회 코드가 저장된 학생들이 화면만 열어도 틀린 코드로 셈 →
 * 같은 학교 IP에서 수백 명이 한꺼번에 열어도 막히지 않게 따로, 넉넉하게
 */
export const joinLookupFails = limiter(1000, 10 * 60_000);
/** 로그인 실패: 한 IP에서 10분에 30번까지 (아이디를 바꿔 가며 찍기 방지. 아이디별 5회 잠금은 따로) */
export const loginFails = limiter(30, 10 * 60_000);

const publicHost = (() => {
  try {
    return new URL(env.publicUrl).host;
  } catch {
    return '';
  }
})();

/**
 * 브라우저가 붙여 보내는 Origin이 이 사이트가 아니면 거절 (CSRF·소켓 가로채기 방지).
 * Origin이 없는 요청(curl 같은 도구)은 쿠키 로그인 검사가 따로 막음
 */
export function sameOrigin(headers: IncomingHttpHeaders, remote: string | undefined): boolean {
  const origin = headers.origin;
  if (origin === undefined) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  if (host === headers.host || (publicHost && host === publicHost)) return true;
  const fwd = headers['x-forwarded-host'];
  return LOOPBACK.has(remote ?? '') && typeof fwd === 'string' && fwd.split(',')[0]!.trim() === host;
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function registerSecurity(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    reply.headers({
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      // 무대 링크(?key=)가 다른 사이트로 새지 않게
      'Referrer-Policy': 'same-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      ...(env.isProd ? { 'Strict-Transport-Security': 'max-age=15552000' } : {}),
    });
    const unsafe = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
    if (unsafe && !sameOrigin(req.headers, req.socket.remoteAddress)) {
      return reply.code(403).send({ error: 'BAD_ORIGIN', message: '다른 사이트에서 보낸 요청은 받지 않아요' });
    }
  });

  // 서버 내부 오류 내용(DB 메시지 등)은 화면에 내보내지 않음
  app.setErrorHandler((error: { statusCode?: number; code?: string }, req, reply) => {
    const code = typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
    if (code >= 500) {
      req.log.error(error);
      return reply.code(500).send({ error: 'SERVER', message: '서버에서 오류가 났어요. 잠시 뒤 다시 해 주세요' });
    }
    const message = code === 413 ? '파일이나 내용이 너무 커요' : code === 429 ? '요청이 너무 많아요. 잠시 뒤 다시 해 주세요' : '요청을 확인해 주세요';
    return reply.code(code).send({ error: error.code ?? 'BAD_REQUEST', message });
  });
}
