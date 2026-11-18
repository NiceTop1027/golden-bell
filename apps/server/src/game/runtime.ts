// 진행 중인 대회 1개의 메모리 상태 + 영속화 + 방송 + 타이머 예약
import type { Namespace, Socket } from 'socket.io';
import {
  type Answer,
  type ClientToServerEvents,
  type HostAlert,
  type HostCommandType,
  type QuestionConfig,
  type Round,
  type ServerToClientEvents,
  DEFAULT_TIME_SEC,
  FINAL_TIME_SEC,
  SUBMIT_GRACE_MS,
  parseRules,
} from '@gb/shared';
import { db } from '../lib/db.ts';
import { newToken, sha256 } from '../lib/crypto.ts';
import {
  type CQ,
  type Dirty,
  type GameState,
  type PState,
  applyCommand,
  initialRun,
  recoverRun,
  submit as engineSubmit,
} from './engine.ts';
import { type RuntimeInfo, hostView, playerView, stageView } from './views.ts';

type GameNs = Namespace<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export const rooms = {
  host: (id: string) => `c:${id}:host`,
  stage: (id: string) => `c:${id}:stage`,
  players: (id: string) => `c:${id}:players`,
  player: (pid: string) => `p:${pid}`,
};

/** 편성 잠금 때 저장하는 문제 스냅샷 */
export type CqSnapshot = {
  type: CQ['type'];
  body: string;
  mediaUrl: string | null;
  config: QuestionConfig;
  explanation: string | null;
  timeLimitSec: number;
};

export function resolveTimeLimit(round: Round, type: CQ['type'], override: number | null, own: number | null) {
  return override ?? own ?? (round === 'FINAL' ? FINAL_TIME_SEC : DEFAULT_TIME_SEC[type]);
}

export class ContestRuntime {
  private connected = new Map<string, Set<string>>(); // participantId → socket ids
  private hidden = new Set<string>(); // 화면을 벗어난 학생
  private deviceAlerts: (HostAlert & { kind: 'DEVICE' })[] = [];
  private pendingDevice = new Map<string, string>(); // participantId → 새 기기 socket id
  private processed: string[] = [];
  private lastAction: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private throttle: NodeJS.Timeout | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    public state: GameState,
    private ns: GameNs,
  ) {}

  get id() {
    return this.state.contestId;
  }

  private info(): RuntimeInfo {
    return {
      hidden: this.hidden,
      connected: new Set([...this.connected.entries()].filter(([, s]) => s.size > 0).map(([id]) => id)),
      alerts: this.deviceAlerts,
      lastAction: this.lastAction,
    };
  }

  /** DB 쓰기를 순서대로 실행 */
  private persist<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn);
    this.queue = p.catch((e) => console.error('[persist]', e));
    return p;
  }

  // ── 방송 ───────────────────────────────────────────────────────
  broadcastAll() {
    const info = this.info();
    this.ns.to(rooms.stage(this.id)).emit('state', stageView(this.state, info));
    this.ns.to(rooms.host(this.id)).emit('state', hostView(this.state, info));
    for (const [pid, sockets] of this.connected) {
      if (sockets.size > 0 && this.state.participants[pid]) {
        this.ns.to(rooms.player(pid)).emit('state', playerView(this.state, pid));
      }
    }
  }

  /** 제출 수처럼 자주 바뀌는 값은 초당 최대 2번으로 묶음 (8.3) */
  private scheduleLight() {
    if (this.throttle) return;
    this.throttle = setTimeout(() => {
      this.throttle = null;
      const info = this.info();
      this.ns.to(rooms.stage(this.id)).emit('state', stageView(this.state, info));
      this.ns.to(rooms.host(this.id)).emit('state', hostView(this.state, info));
    }, 500);
  }

  hostState() {
    return hostView(this.state, this.info());
  }
  stageState() {
    return stageView(this.state, this.info());
  }
  playerState(pid: string) {
    return playerView(this.state, pid);
  }

  // ── 타이머 예약: 자동 마감, 읽기 시간 후 자동 시작 ─────────────
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const r = this.state.run;
    if (r.phase === 'ANSWERING' && r.endsAt !== null && this.state.rules.autoClose) {
      this.timer = setTimeout(() => void this.command(null, `auto-close:${r.endsAt}`, 'CLOSE', { auto: true }), Math.max(0, r.endsAt - Date.now()));
    } else if (r.phase === 'READING' && r.readingEndsAt !== null) {
      this.timer = setTimeout(() => void this.command(null, `auto-start:${r.readingEndsAt}`, 'START_TIMER'), Math.max(0, r.readingEndsAt - Date.now()));
    }
  }

  // ── 진행자 명령 ────────────────────────────────────────────────
  async command(
    actorId: string | null,
    commandId: string,
    type: HostCommandType,
    args: Record<string, unknown> = {},
  ): Promise<{ ok: true } | { ok: false; error: string; message?: string }> {
    if (this.processed.includes(commandId)) return { ok: false, error: 'DUPLICATE' };

    if (type === 'APPROVE_DEVICE' || type === 'REJECT_DEVICE') {
      const res = await this.resolveDevice(String(args.participantId ?? ''), type === 'APPROVE_DEVICE');
      if (res.ok) this.remember(commandId, actorId, type, args, res.log);
      return res.ok ? { ok: true } : res;
    }

    const before = this.state.run.phase;
    const res = applyCommand(this.state, type, args, Date.now());
    if (!res.ok) {
      // 마감 직후 유예 중에 정답 공개를 누르면 유예가 끝난 뒤 실행
      if (res.error === 'GRACE' && this.state.run.closedAt !== null) {
        const wait = this.state.run.closedAt + SUBMIT_GRACE_MS - Date.now() + 20;
        await new Promise((r) => setTimeout(r, Math.max(0, wait)));
        return this.command(actorId, commandId, type, args);
      }
      return res;
    }
    this.remember(commandId, actorId, type, args, res.log);
    this.schedule();
    this.broadcastAll();
    const statusChange = before === 'LOBBY' && type === 'START' ? 'LIVE' : this.state.run.phase === 'FINISHED' ? 'FINISHED' : null;
    void this.persist(() => this.save(res.dirty, statusChange));
    return { ok: true };
  }

  private remember(commandId: string, actorId: string | null, type: string, args: Record<string, unknown>, log: string) {
    this.processed.push(commandId);
    if (this.processed.length > 500) this.processed.shift();
    this.lastAction = log;
    void this.persist(() =>
      db.hostLog.create({
        data: { contestId: this.id, actorId, action: type, payload: JSON.parse(JSON.stringify({ args, log, auto: actorId === null })) },
      }),
    );
  }

  private async save(d: Dirty, status: 'LIVE' | 'FINISHED' | null) {
    const s = this.state;
    const r = s.run;
    const ops = [];
    ops.push(
      db.contestRun.upsert({
        where: { contestId: s.contestId },
        create: {
          contestId: s.contestId,
          phase: r.phase,
          currentCqId: r.currentCqId,
          endsAt: r.endsAt ? new Date(r.endsAt) : null,
          pausedRemainingMs: r.pausedRemainingMs,
          revivalUsed: r.revivalUsed,
          snapshot: JSON.parse(JSON.stringify(r)),
        },
        update: {
          phase: r.phase,
          currentCqId: r.currentCqId,
          endsAt: r.endsAt ? new Date(r.endsAt) : null,
          pausedRemainingMs: r.pausedRemainingMs,
          revivalUsed: r.revivalUsed,
          snapshot: JSON.parse(JSON.stringify(r)),
        },
      }),
    );
    for (const id of d.participants) {
      const p = s.participants[id];
      if (!p) continue;
      ops.push(
        db.participant.update({
          where: { id },
          data: { status: p.status, eliminatedAt: p.eliminatedAt, eliminatedSeq: p.eliminatedSeq, revivedCount: p.revivedCount },
        }),
      );
    }
    for (const cqId of d.subsOf) {
      for (const sub of Object.values(s.subs[cqId] ?? {})) {
        ops.push(
          db.submission.updateMany({
            where: { participantId: sub.participantId, contestQuestionId: cqId },
            data: { isCorrect: sub.isCorrect, judgedBy: sub.judgedBy },
          }),
        );
      }
    }
    for (const cqId of d.voided) ops.push(db.contestQuestion.update({ where: { id: cqId }, data: { voided: true } }));
    if (status) ops.push(db.contest.update({ where: { id: s.contestId }, data: { status } }));
    await db.$transaction(ops);
  }

  // ── 학생 ───────────────────────────────────────────────────────
  attachPlayer(socket: GameSocket, pid: string) {
    socket.data.participantId = pid;
    socket.data.contestId = this.id;
    socket.data.role = 'player';
    void socket.join([rooms.players(this.id), rooms.player(pid)]);
    const set = this.connected.get(pid) ?? new Set();
    const wasOffline = set.size === 0;
    set.add(socket.id);
    this.connected.set(pid, set);
    if (wasOffline) this.scheduleLight();
  }

  /** 학생 화면 이탈 (참고용 표시만, 판정에는 쓰지 않음) */
  setHidden(pid: string, hidden: boolean) {
    const had = this.hidden.has(pid);
    if (hidden) this.hidden.add(pid);
    else this.hidden.delete(pid);
    if (had !== hidden) this.scheduleLight();
  }

  /** 대회 준비 화면에서 바꾼 무대 링크를 진행 중인 런타임에도 반영 */
  setStageKey(key: string) {
    this.state.stageKey = key;
    this.scheduleLight();
  }

  detachSocket(socket: GameSocket) {
    const pid = socket.data.participantId as string | undefined;
    if (pid) {
      const set = this.connected.get(pid);
      set?.delete(socket.id);
      if (set && set.size === 0) {
        this.hidden.delete(pid);
        this.scheduleLight();
      }
    }
    for (const [p, sid] of this.pendingDevice) {
      if (sid === socket.id) {
        this.pendingDevice.delete(p);
        this.deviceAlerts = this.deviceAlerts.filter((a) => a.participantId !== p);
        this.scheduleLight();
      }
    }
  }

  async join(
    socket: GameSocket,
    input: { studentNo: string; name: string; token?: string },
    useRoster: boolean,
  ): Promise<{ ok: true; participantId: string; token: string } | { ok: false; error: string; message?: string }> {
    const existing = Object.values(this.state.participants).find((p) => p.studentNo === input.studentNo);
    if (existing) {
      const row = await db.participant.findUnique({ where: { id: existing.id }, select: { tokenHash: true } });
      if (input.token && row && sha256(input.token) === row.tokenHash) {
        this.attachPlayer(socket, existing.id);
        return { ok: true, participantId: existing.id, token: input.token };
      }
      // 다른 기기에서 같은 학번 → 진행자 승인 대기 (5.7)
      this.pendingDevice.set(existing.id, socket.id);
      this.deviceAlerts = this.deviceAlerts.filter((a) => a.participantId !== existing.id);
      this.deviceAlerts.push({
        id: `dev:${existing.id}`,
        kind: 'DEVICE',
        participantId: existing.id,
        studentNo: existing.studentNo,
        name: input.name,
      });
      socket.data.contestId = this.id;
      socket.data.role = 'pending';
      this.scheduleLight();
      return { ok: false, error: 'DEVICE_CHANGE_PENDING', message: '이미 참가한 학번입니다. 진행자 승인을 기다려주세요' };
    }

    if (this.state.run.started && this.state.rules.lateJoin === 'BEFORE_START') {
      return { ok: false, error: 'JOIN_CLOSED', message: '이미 시작된 대회입니다' };
    }
    if (useRoster) {
      const r = await db.rosterEntry.findUnique({
        where: { contestId_studentNo: { contestId: this.id, studentNo: input.studentNo } },
      });
      // 명단의 이름은 알려 주지 않고, 학번과 이름 중 무엇을 확인할지만 알려 줌
      if (!r) return { ok: false, error: 'NOT_IN_ROSTER', message: '명단에 없는 학번이에요. 학번을 다시 확인하고, 맞다면 선생님께 말해 주세요' };
      if (r.name.replace(/\s/g, '') !== input.name.replace(/\s/g, '')) {
        return { ok: false, error: 'NOT_IN_ROSTER', message: '학번은 명단에 있지만 이름이 달라요. 이름을 다시 확인해 주세요' };
      }
    }
    const token = newToken();
    const row = await this.persist(() =>
      db.participant.create({
        data: { contestId: this.id, studentNo: input.studentNo, name: input.name, tokenHash: sha256(token) },
      }),
    );
    const p: PState = {
      id: row.id,
      studentNo: row.studentNo,
      name: row.name,
      status: 'ALIVE',
      eliminatedAt: null,
      eliminatedSeq: null,
      revivedCount: 0,
      joinedAt: row.joinedAt.getTime(),
    };
    this.state.participants[p.id] = p;
    this.attachPlayer(socket, p.id);
    this.scheduleLight();
    return { ok: true, participantId: p.id, token };
  }

  private async resolveDevice(pid: string, approve: boolean) {
    const sid = this.pendingDevice.get(pid);
    const p = this.state.participants[pid];
    if (!sid || !p) return { ok: false as const, error: 'NOT_FOUND', message: '대기 중인 기기 변경 요청이 없습니다' };
    this.pendingDevice.delete(pid);
    this.deviceAlerts = this.deviceAlerts.filter((a) => a.participantId !== pid);
    if (approve) {
      const token = newToken();
      await this.persist(() => db.participant.update({ where: { id: pid }, data: { tokenHash: sha256(token) } }));
      // 이전 기기 연결 끊기
      for (const old of this.connected.get(pid) ?? []) {
        const s = this.ns.sockets.get(old);
        s?.emit('kicked', { reason: '다른 기기로 옮겨졌습니다' });
        s?.disconnect(true);
      }
      this.connected.set(pid, new Set());
      this.ns.sockets.get(sid)?.emit('device:approved', { token, participantId: pid });
    } else {
      this.ns.sockets.get(sid)?.emit('device:rejected');
    }
    this.scheduleLight();
    return { ok: true as const, log: `기기 변경 ${approve ? '승인' : '거절'}: ${p.studentNo} ${p.name}` };
  }

  async submit(pid: string, cqId: string, answer: Answer) {
    const now = Date.now();
    const res = engineSubmit(this.state, pid, cqId, answer, now);
    if (!res.ok) return res;
    const sub = res.sub;
    await this.persist(() =>
      db.submission.upsert({
        where: { participantId_contestQuestionId: { participantId: pid, contestQuestionId: cqId } },
        create: {
          participantId: pid,
          contestQuestionId: cqId,
          answer: sub.answer as never,
          isCorrect: sub.isCorrect,
          receivedAt: new Date(sub.receivedAt),
        },
        update: { answer: sub.answer as never, isCorrect: sub.isCorrect, judgedBy: 'AUTO', receivedAt: new Date(sub.receivedAt) },
      }),
    );
    this.ns.to(rooms.player(pid)).emit('state', playerView(this.state, pid));
    this.scheduleLight();
    return { ok: true as const, receivedAt: now };
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    if (this.throttle) clearTimeout(this.throttle);
  }
}

// ── 레지스트리: 대회별 런타임 1개 ─────────────────────────────────
const runtimes = new Map<string, Promise<ContestRuntime>>();

export function getRuntime(ns: GameNs, contestId: string): Promise<ContestRuntime> {
  let p = runtimes.get(contestId);
  if (!p) {
    p = loadRuntime(ns, contestId);
    runtimes.set(contestId, p);
    p.catch(() => runtimes.delete(contestId));
  }
  return p;
}

/** 이미 불러온 런타임만 (없으면 null, 새로 불러오지 않음) */
export async function peekRuntime(contestId: string): Promise<ContestRuntime | null> {
  const p = runtimes.get(contestId);
  return p ? p.catch(() => null) : null;
}

export async function dropRuntime(contestId: string) {
  const p = runtimes.get(contestId);
  runtimes.delete(contestId);
  if (p) (await p.catch(() => null))?.dispose();
}

async function loadRuntime(ns: GameNs, contestId: string): Promise<ContestRuntime> {
  const c = await db.contest.findUnique({
    where: { id: contestId },
    include: {
      questions: { orderBy: { orderNo: 'asc' }, include: { question: { include: { media: true } } } },
      participants: true,
      run: true,
    },
  });
  if (!c) throw new Error('NOT_FOUND');
  if (c.status === 'DRAFT') throw new Error('NOT_LOCKED');

  const questions: CQ[] = c.questions.map((cq) => {
    const snap = cq.snapshot as CqSnapshot | null;
    const src: CqSnapshot = snap ?? {
      type: cq.question.type,
      body: cq.question.body,
      mediaUrl: cq.question.media ? `/media/${cq.question.media.path}` : null,
      config: { type: cq.question.type, ...(cq.question.config as object) } as QuestionConfig,
      explanation: cq.question.explanation,
      timeLimitSec: resolveTimeLimit(cq.round, cq.question.type, cq.timeLimitSec, cq.question.timeLimitSec),
    };
    return {
      id: cq.id,
      orderNo: cq.orderNo,
      round: cq.round,
      type: src.type,
      body: src.body,
      mediaUrl: src.mediaUrl,
      config: src.config,
      explanation: src.explanation,
      timeLimitSec: src.timeLimitSec,
      voided: cq.voided,
    };
  });

  const participants: GameState['participants'] = {};
  for (const p of c.participants) {
    participants[p.id] = {
      id: p.id,
      studentNo: p.studentNo,
      name: p.name,
      status: p.status,
      eliminatedAt: p.eliminatedAt,
      eliminatedSeq: p.eliminatedSeq,
      revivedCount: p.revivedCount,
      joinedAt: p.joinedAt.getTime(),
    };
  }

  const subs: GameState['subs'] = {};
  const rows = await db.submission.findMany({ where: { contestQuestion: { contestId, voided: false } } });
  for (const s of rows) {
    (subs[s.contestQuestionId] ??= {})[s.participantId] = {
      participantId: s.participantId,
      cqId: s.contestQuestionId,
      answer: s.answer as Answer,
      isCorrect: s.isCorrect,
      judgedBy: s.judgedBy,
      receivedAt: s.receivedAt.getTime(),
    };
  }

  const state: GameState = {
    contestId: c.id,
    title: c.title,
    joinCode: c.joinCode,
    stageKey: c.stageKey,
    rules: parseRules(c.rules),
    questions,
    participants,
    subs,
    run: c.run ? (c.run.snapshot as GameState['run']) : initialRun(),
  };
  // 서버 재시작 복구: 답변 중이었다면 일시정지 상태로 (8.7)
  recoverRun(state, Date.now());
  const rt = new ContestRuntime(state, ns);
  if (c.run && c.run.phase === 'ANSWERING') console.log(`[recover] ${c.title}: 답변 중 → 일시정지로 복구`);
  return rt;
}

/** 서버 시작 시 진행 중이던 대회를 미리 불러옴 */
export async function recoverLiveContests(ns: GameNs) {
  const live = await db.contest.findMany({ where: { status: 'LIVE' }, select: { id: true, title: true } });
  for (const c of live) {
    await getRuntime(ns, c.id);
    console.log(`[recover] 진행 중 대회 불러옴: ${c.title}`);
  }
}
