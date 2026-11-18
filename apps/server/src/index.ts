import { existsSync } from 'node:fs';
import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fstatic from '@fastify/static';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@gb/shared';
import { env } from './lib/env.ts';
import { authRoutes } from './api/auth.ts';
import { contestRoutes } from './api/contests.ts';
import { questionRoutes } from './api/questions.ts';
import { mediaRoutes, MAX_UPLOAD } from './api/media.ts';
import { teacherRoutes } from './api/teachers.ts';
import { subjectRoutes } from './api/subjects.ts';
import { importRoutes } from './api/import.ts';
import multipart from '@fastify/multipart';
import { setupGameSocket } from './socket/index.ts';
import { registerSecurity, sameOrigin } from './lib/security.ts';

// 프록시 헤더는 같은 컴퓨터의 cloudflared가 보낸 것만 믿음 (밖에서 X-Forwarded-For를 꾸며도 무시)
const app = Fastify({ logger: { level: env.isProd ? 'info' : 'warn' }, trustProxy: 'loopback' });
registerSecurity(app);
await app.register(cookie);
await app.register(authRoutes);
await app.register(contestRoutes);
await app.register(multipart, { limits: { fileSize: MAX_UPLOAD, files: 1 } });
await app.register(questionRoutes);
await app.register(mediaRoutes);
await app.register(importRoutes);
await app.register(teacherRoutes);
await app.register(subjectRoutes);
// 업로드한 이미지 (다시 인코딩한 webp만 있음)
await app.register(fstatic, { root: env.uploadDir, prefix: '/media/', decorateReply: false, maxAge: '7d', immutable: true });
app.get('/api/health', async () => ({ ok: true, now: Date.now() }));

// 운영: React 빌드 결과를 같은 서버에서 제공
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(webDist)) {
  // 파일 이름에 해시가 붙은 assets는 오래 캐시, 화면 껍데기(index.html)는 늘 새로 확인
  await app.register(fstatic, {
    root: webDist,
    // 요청마다 파일을 찾음: 서버를 재시작하지 않고 다시 빌드해도 새 파일이 바로 나감
    wildcard: true,
    setHeaders: (res, path) => {
      res.header('Cache-Control', path.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0]!;
    if (path.startsWith('/api') || path.startsWith('/socket.io')) return reply.code(404).send({ error: 'NOT_FOUND' });
    // 없는 파일(예전 배포의 js 등)에 화면 HTML을 주면 브라우저가 "text/html은 모듈이 아님" 오류를 냄 → 그냥 404
    if (path.startsWith('/assets/') || /\.[a-z0-9]{1,8}$/i.test(path)) return reply.code(404).type('text/plain').send('Not Found');
    return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
  });
}

await app.ready();
const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  // 학교망에서 WebSocket이 막히면 롱폴링으로 자동 전환 (8.1)
  transports: ['websocket', 'polling'],
  pingInterval: 10_000,
  pingTimeout: 8_000,
  // 답·명령은 작음. 큰 메시지로 메모리를 채우지 못하게 (기본 1MB)
  maxHttpBufferSize: 100_000,
  // 다른 사이트 페이지가 선생님 로그인 쿠키로 진행 소켓에 붙지 못하게
  allowRequest: (req, cb) => cb(null, sameOrigin(req.headers, req.socket.remoteAddress)),
});
setupGameSocket(io);

await app.listen({ port: env.port, host: '0.0.0.0' });
console.log(`골든벨 서버: http://localhost:${env.port}`);
