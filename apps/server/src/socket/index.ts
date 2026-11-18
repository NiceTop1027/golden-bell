// 계획서 8장: Socket.IO 네임스페이스 /game
import type { Server } from 'socket.io';
import {
  type ClientToServerEvents,
  type ServerToClientEvents,
  hostCommandSchema,
  joinSchema,
  submitSchema,
} from '@gb/shared';
import { db } from '../lib/db.ts';
import { SESSION_COOKIE, canHost, userFromToken } from '../lib/auth.ts';
import { getRuntime, recoverLiveContests, rooms } from '../game/runtime.ts';
import { clientIp, joinCodeFails } from '../lib/security.ts';

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function setupGameSocket(io: Server<ClientToServerEvents, ServerToClientEvents>) {
  const ns = io.of('/game');

  ns.on('connection', (socket) => {
    socket.on('time:ping', (p, ack) => {
      if (typeof ack === 'function') ack({ serverNow: Date.now() });
    });

    socket.on('player:join', async (raw, ack) => {
      if (typeof ack !== 'function') return;
      const parsed = joinSchema.safeParse(raw);
      if (!parsed.success) return ack({ ok: false, error: 'INVALID', message: '입력을 확인해주세요' });
      const { code, studentNo, name, token } = parsed.data;
      const ip = clientIp(socket.handshake.address, socket.handshake.headers);
      if (joinCodeFails.blocked(ip)) {
        return ack({ ok: false, error: 'RATE_LIMITED', message: '틀린 코드를 너무 많이 넣었어요. 잠시 뒤 다시 해 주세요' });
      }
      const contest = await db.contest.findUnique({ where: { joinCode: code } });
      if (!contest || (contest.status !== 'LOCKED' && contest.status !== 'LIVE')) {
        joinCodeFails.hit(ip);
        return ack({ ok: false, error: 'NOT_FOUND', message: '대회 코드를 다시 확인해주세요' });
      }
      try {
        const rt = await getRuntime(ns, contest.id);
        const res = await rt.join(socket, { studentNo, name, token }, contest.useRoster);
        if (!res.ok) return ack(res);
        ack({ ok: true, participantId: res.participantId, contestId: contest.id, token: res.token, state: rt.playerState(res.participantId) });
      } catch (e) {
        console.error('[join]', e);
        ack({ ok: false, error: 'INVALID', message: '참가 처리 중 오류가 났습니다' });
      }
    });

    socket.on('player:submit', async (raw, ack) => {
      if (typeof ack !== 'function') return;
      const { contestId, participantId, role } = socket.data as { contestId?: string; participantId?: string; role?: string };
      // 재접속 직후 재참가가 끝나기 전 제출 → 학생 화면이 재참가 후 다시 보냄
      if (role !== 'player' || !contestId || !participantId) return ack({ ok: false, error: 'NOT_JOINED' });
      const parsed = submitSchema.safeParse(raw);
      if (!parsed.success) return ack({ ok: false, error: 'INVALID' });
      const rt = await getRuntime(ns, contestId);
      const res = await rt.submit(participantId, parsed.data.cqId, parsed.data.answer);
      ack(res.ok ? { ok: true, receivedAt: res.receivedAt } : { ok: false, error: res.error });
    });

    socket.on('player:visibility', async (raw) => {
      const { contestId, participantId, role } = socket.data as { contestId?: string; participantId?: string; role?: string };
      if (role !== 'player' || !contestId || !participantId || typeof raw?.hidden !== 'boolean') return;
      const rt = await getRuntime(ns, contestId).catch(() => null);
      rt?.setHidden(participantId, raw.hidden);
    });

    socket.on('host:attach', async (raw, ack) => {
      if (typeof ack !== 'function') return;
      const contestId = typeof raw?.contestId === 'string' ? raw.contestId : '';
      const user = await userFromToken(readCookie(socket.handshake.headers.cookie, SESSION_COOKIE));
      if (!user) return ack({ ok: false, error: 'UNAUTHORIZED', message: '로그인이 필요합니다' });
      if (user.mustChangePw) return ack({ ok: false, error: 'FORBIDDEN', message: '먼저 비밀번호를 바꿔 주세요' });
      if (!(await canHost(user, contestId).catch(() => false))) return ack({ ok: false, error: 'FORBIDDEN', message: '진행 권한이 없습니다' });
      try {
        const rt = await getRuntime(ns, contestId);
        socket.data = { role: 'host', contestId, userId: user.id };
        await socket.join(rooms.host(contestId));
        ack({ ok: true, state: rt.hostState() });
      } catch (e) {
        const msg = e instanceof Error && e.message === 'NOT_LOCKED' ? '편성을 잠근 대회만 진행할 수 있습니다' : '대회를 찾을 수 없습니다';
        ack({ ok: false, error: 'NOT_FOUND', message: msg });
      }
    });

    socket.on('host:command', async (raw, ack) => {
      if (typeof ack !== 'function') return;
      const { role, contestId, userId } = socket.data as { role?: string; contestId?: string; userId?: string };
      if (role !== 'host' || !contestId || !userId) return ack({ ok: false, error: 'FORBIDDEN' });
      const parsed = hostCommandSchema.safeParse(raw);
      if (!parsed.success) return ack({ ok: false, error: 'INVALID' });
      // 매 명령마다 세션·권한 재확인 (10.2)
      const user = await userFromToken(readCookie(socket.handshake.headers.cookie, SESSION_COOKIE));
      if (!user || user.mustChangePw || user.id !== userId || !(await canHost(user, contestId))) return ack({ ok: false, error: 'FORBIDDEN' });
      const rt = await getRuntime(ns, contestId);
      ack(await rt.command(userId, parsed.data.commandId, parsed.data.type, parsed.data.args ?? {}));
    });

    socket.on('stage:attach', async (raw, ack) => {
      if (typeof ack !== 'function') return;
      const contestId = typeof raw?.contestId === 'string' ? raw.contestId : '';
      const contest = await db.contest.findUnique({ where: { id: contestId } }).catch(() => null);
      if (!contest || contest.stageKey !== raw?.stageKey) return ack({ ok: false, error: 'FORBIDDEN', message: '무대 링크가 올바르지 않습니다' });
      try {
        const rt = await getRuntime(ns, contestId);
        socket.data = { role: 'stage', contestId };
        await socket.join(rooms.stage(contestId));
        ack({ ok: true, state: rt.stageState() });
      } catch {
        ack({ ok: false, error: 'NOT_FOUND', message: '편성을 잠근 대회만 띄울 수 있습니다' });
      }
    });

    socket.on('disconnect', async () => {
      const contestId = (socket.data as { contestId?: string }).contestId;
      if (!contestId) return;
      const rt = await getRuntime(ns, contestId).catch(() => null);
      rt?.detachSocket(socket);
    });
  });

  void recoverLiveContests(ns).catch((e) => console.error('[recover]', e));
  return ns;
}
