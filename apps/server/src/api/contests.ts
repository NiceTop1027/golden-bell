// 계획서 5.5–5.7·5.12·9장: 대회 생성·규칙·편성·잠금·명단·진행 권한·결과·CSV
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  type Answer,
  type ContestDetailDTO,
  type ContestSummaryDTO,
  type QuestionConfig,
  type QuestionStatRow,
  type RankingRow,
  type ResultDTO,
  type RosterEntryDTO,
  type Round,
  contestBaseSchema,
  contestUpdateSchema,
  hostsSchema,
  lineupSchema,
  normalizeShort,
  parseRules,
  rosterSchema,
} from '@gb/shared';
import { db, type Prisma } from '../lib/db.ts';
import { newJoinCode, newToken } from '../lib/crypto.ts';
import { type AuthUser, canHost, hasStaffPower, requireUser } from '../lib/auth.ts';
import { joinLookupFails, reqIp } from '../lib/security.ts';
import { type CqSnapshot, dropRuntime, peekRuntime, resolveTimeLimit } from '../game/runtime.ts';
import type { Run } from '../game/engine.ts';
import { answerText } from '../game/grading.ts';
import { include as qInclude, toDTO } from './questions.ts';

// 학생이 쓴 이름·답이 =, +, -, @로 시작하면 엑셀이 수식으로 실행함 → 앞에 '를 붙여 글자로만 보이게
const csvCell = (v: string | number | null | undefined) => {
  const s = String(v ?? '');
  const safe = typeof v === 'string' && /^[=+@\t\r]|^-./.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
const csv = (rows: (string | number | null | undefined)[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
const err = (reply: FastifyReply, code: number, error: string, message: string) => reply.code(code).send({ error, message });
const isUuid = (s: string) => z.string().uuid().safeParse(s).success;

async function uniqueJoinCode() {
  for (let i = 0; i < 20; i++) {
    const code = newJoinCode();
    if (!(await db.contest.findUnique({ where: { joinCode: code }, select: { id: true } }))) return code;
  }
  throw new Error('참가 코드를 만들지 못했어요');
}

/** 편성이 바뀌면 메모리에 올라간 진행 상태를 버려 다음 접속 때 다시 불러오게 함 (시작 전만) */
async function refreshIfIdle(contestId: string) {
  const c = await db.contest.findUnique({ where: { id: contestId }, select: { status: true } });
  if (c && c.status !== 'LIVE') await dropRuntime(contestId);
}

async function loadForManage(req: { params: { id: string } }, reply: FastifyReply, user: AuthUser) {
  if (!isUuid(req.params.id)) return void err(reply, 404, 'NOT_FOUND', '대회를 찾을 수 없어요');
  if (!(await canHost(user, req.params.id))) return void err(reply, 403, 'FORBIDDEN', '이 대회에 권한이 없어요');
  const c = await db.contest.findUnique({ where: { id: req.params.id } });
  if (!c) return void err(reply, 404, 'NOT_FOUND', '대회를 찾을 수 없어요');
  return c;
}

/** 화면 표시 번호: 예비·패자부활을 뺀 본 순서 */
function displayIndex(cqs: { id: string; round: Round }[]) {
  const map = new Map<string, number>();
  let n = 0;
  for (const cq of cqs) if (cq.round !== 'SPARE' && cq.round !== 'REVIVAL') map.set(cq.id, ++n);
  return map;
}

function formatAnswer(cfg: QuestionConfig | null, a: unknown): string {
  if (a === null || a === undefined) return '';
  if (cfg?.type === 'CHOICE' && typeof a === 'number') return `${a + 1}. ${cfg.choices[a] ?? ''}`;
  if (Array.isArray(a)) {
    if (cfg?.type === 'ORDER') return a.map((id) => cfg.items.find((i) => i.id === id)?.text ?? id).join(' → ');
    return a.join(' → ');
  }
  return String(a);
}

async function buildResult(contestId: string): Promise<ResultDTO | null> {
  const c = await db.contest.findUnique({
    where: { id: contestId },
    include: {
      questions: { orderBy: { orderNo: 'asc' } },
      participants: { orderBy: { studentNo: 'asc' } },
      run: true,
      logs: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { name: true } } } },
    },
  });
  if (!c) return null;
  const subs = await db.submission.findMany({ where: { contestQuestion: { contestId } } });
  const run = (c.run?.snapshot ?? null) as Run | null;
  const idx = displayIndex(c.questions);
  const winners = new Set(run?.finish?.winnerIds ?? []);
  const score = (p: (typeof c.participants)[number]) => (winners.has(p.id) || p.status === 'ALIVE' ? Number.MAX_SAFE_INTEGER : (p.eliminatedSeq ?? 0));
  const validCq = new Set(c.questions.filter((q) => !q.voided).map((q) => q.id));
  const ranking: RankingRow[] = c.participants
    .map((p) => {
      const mine = subs.filter((s) => s.participantId === p.id && validCq.has(s.contestQuestionId));
      return {
        rank: 1 + c.participants.filter((o) => score(o) > score(p)).length,
        studentNo: p.studentNo,
        name: p.name,
        status: p.status,
        eliminatedAtIndex: p.eliminatedAt ? (idx.get(p.eliminatedAt) ?? null) : null,
        revivedCount: p.revivedCount,
        correctCount: mine.filter((s) => s.isCorrect).length,
        answeredCount: mine.length,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.studentNo.localeCompare(b.studentNo));

  const asked = new Set(run?.askedCqIds ?? []);
  const questions: QuestionStatRow[] = c.questions.map((cq) => {
    const snap = cq.snapshot as CqSnapshot | null;
    const cfg = snap?.config ?? null;
    const mine = subs.filter((s) => s.contestQuestionId === cq.id);
    const start = run?.timerStarts?.[cq.id];
    const times = start ? mine.map((s) => s.receivedAt.getTime() - start).filter((t) => t >= 0) : [];
    let choiceCounts: number[] | null = null;
    if (cfg?.type === 'CHOICE') {
      choiceCounts = cfg.choices.map((_, i) => mine.filter((s) => s.answer === i).length);
    }
    const wrong = new Map<string, { answer: string; count: number }>();
    if (cfg && (cfg.type === 'SHORT' || cfg.type === 'INITIAL')) {
      for (const s of mine) {
        if (s.isCorrect || typeof s.answer !== 'string') continue;
        const n = normalizeShort(s.answer);
        const w = wrong.get(n) ?? { answer: s.answer.trim(), count: 0 };
        w.count += 1;
        wrong.set(n, w);
      }
    }
    return {
      cqId: cq.id,
      orderNo: cq.orderNo,
      index: idx.get(cq.id) ?? null,
      round: cq.round,
      type: snap?.type ?? 'SHORT',
      body: snap?.body ?? '',
      answerText: cfg ? answerText(cfg) : '',
      voided: cq.voided,
      asked: asked.has(cq.id),
      targets: run?.targetCounts?.[cq.id] ?? mine.length,
      submitted: mine.length,
      correct: mine.filter((s) => s.isCorrect).length,
      avgResponseMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
      choiceCounts,
      wrongTop: [...wrong.values()].sort((a, b) => b.count - a.count).slice(0, 3),
    };
  });

  return {
    contest: { id: c.id, title: c.title, heldOn: c.heldOn.toISOString().slice(0, 10), status: c.status },
    ranking,
    questions,
    logs: c.logs.map((l) => ({
      at: l.createdAt.toISOString(),
      action: l.action,
      log: String((l.payload as { log?: string })?.log ?? l.action),
      actor: l.actor?.name ?? (l.actorId ? null : '자동'),
    })),
  };
}

export async function contestRoutes(app: FastifyInstance) {
  // 대회 목록 (관리자: 전체, 선생님: 진행 권한 받은 것)
  app.get('/api/contests', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const where = {};
    const list = await db.contest.findMany({
      where,
      orderBy: [{ heldOn: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { participants: true, questions: true } } },
    });
    const res: ContestSummaryDTO[] = list.map((c) => ({
      id: c.id,
      title: c.title,
      heldOn: c.heldOn.toISOString().slice(0, 10),
      status: c.status,
      joinCode: c.joinCode,
      stageKey: c.stageKey,
      participants: c._count.participants,
      questions: c._count.questions,
      canManage: hasStaffPower(user),
    }));
    return res;
  });

  app.post('/api/contests', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const body = contestBaseSchema.safeParse(req.body);
    if (!body.success) return err(reply, 400, 'INVALID', body.error.issues[0]?.message ?? '입력을 확인해 주세요');
    const c = await db.contest.create({
      data: {
        title: body.data.title,
        heldOn: new Date(body.data.heldOn),
        joinCode: await uniqueJoinCode(),
        stageKey: newToken(),
        rules: {},
        createdBy: user.id,
        hosts: { create: [{ userId: user.id }] },
      },
    });
    return reply.code(201).send({ id: c.id });
  });

  app.get<{ Params: { id: string } }>('/api/contests/:id', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const c0 = await loadForManage(req, reply, user);
    if (!c0) return;
    const c = await db.contest.findUniqueOrThrow({
      where: { id: c0.id },
      include: {
        hosts: true,
        questions: { orderBy: { orderNo: 'asc' }, include: { question: { include: qInclude } } },
        run: { select: { contestId: true } },
        _count: { select: { participants: true, roster: true } },
      },
    });
    const res: ContestDetailDTO = {
      id: c.id,
      title: c.title,
      heldOn: c.heldOn.toISOString().slice(0, 10),
      status: c.status,
      joinCode: c.joinCode,
      stageKey: c.stageKey,
      participants: c._count.participants,
      questions: c.questions.length,
      canManage: hasStaffPower(user),
      useRoster: c.useRoster,
      rules: parseRules(c.rules),
      hostIds: c.hosts.map((h) => h.userId),
      lineup: c.questions.map((cq) => {
        const snap = c.status === 'DRAFT' ? null : (cq.snapshot as CqSnapshot | null);
        return {
          questionId: cq.questionId,
          round: cq.round,
          timeLimitSec: cq.timeLimitSec,
          question: toDTO(cq.question, user),
          locked: snap ? { body: snap.body, config: snap.config, mediaUrl: snap.mediaUrl, explanation: snap.explanation, timeLimitSec: snap.timeLimitSec } : null,
        };
      }),
      rosterCount: c._count.roster,
      started: c.status === 'LIVE' || c.status === 'FINISHED',
    };
    return res;
  });

  app.patch<{ Params: { id: string } }>('/api/contests/:id', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const c = await loadForManage(req, reply, user);
    if (!c) return;
    const body = contestUpdateSchema.safeParse(req.body);
    if (!body.success) return err(reply, 400, 'INVALID', body.error.issues[0]?.message ?? '입력을 확인해 주세요');
    if ((c.status === 'LIVE' || c.status === 'FINISHED') && (body.data.rules || body.data.useRoster !== undefined)) {
      return err(reply, 409, 'STARTED', '시작한 대회는 규칙과 명단 사용을 바꿀 수 없어요');
    }
    const d = body.data;
    // 잠근 대회에서 빈 명단으로 명단 사용을 켜면 아무도 못 들어옴
    if (d.useRoster === true && !c.useRoster && c.status === 'LOCKED' && (await db.rosterEntry.count({ where: { contestId: c.id } })) === 0) {
      return err(reply, 400, 'EMPTY_ROSTER', '명단이 비어 있어서 명단 사용을 켤 수 없어요. 명단 탭에서 먼저 명단을 올려 주세요');
    }
    await db.contest.update({
      where: { id: c.id },
      data: {
        title: d.title,
        heldOn: d.heldOn ? new Date(d.heldOn) : undefined,
        useRoster: d.useRoster,
        rules: d.rules ? { ...parseRules(c.rules), ...d.rules } : undefined,
      },
    });
    await refreshIfIdle(c.id);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/contests/:id', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const c = await loadForManage(req, reply, user);
    if (!c) return;
    const n = await db.participant.count({ where: { contestId: c.id } });
    if (c.status === 'LIVE' || c.status === 'FINISHED' || n > 0) return err(reply, 409, 'STARTED', '참가자가 있거나 진행한 대회는 지울 수 없어요');
    await dropRuntime(c.id);
    await db.contest.delete({ where: { id: c.id } });
    return { ok: true };
  });

  // 편성 저장 (전체 순서) — 편성 중일 때만
  app.put<{ Params: { id: string } }>('/api/contests/:id/lineup', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const c = await loadForManage(req, reply, user);
    if (!c) return;
    if (c.status !== 'DRAFT') return err(reply, 409, 'LOCKED', '잠긴 편성은 고칠 수 없어요. 먼저 잠금을 풀어 주세요');
    const body = lineupSchema.safeParse(req.body);
    if (!body.success) return err(reply, 400, 'INVALID', body.error.issues[0]?.message ?? '편성을 확인해 주세요');
    const ids = body.data.items.map((i) => i.questionId);
    if (new Set(ids).size !== ids.length) return err(reply, 400, 'DUPLICATE', '같은 문제가 두 번 들어 있어요');
    const qs = await db.question.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, body: true } });
    if (qs.length !== ids.length) return err(reply, 400, 'NOT_FOUND', '없는 문제가 있어요. 목록을 새로 고쳐 주세요');
    const bad = qs.find((q) => q.status !== 'APPROVED');
    if (bad) return err(reply, 400, 'NOT_APPROVED', `승인되지 않은 문제가 있어요: "${bad.body.slice(0, 20)}"`);
    await db.$transaction([
      db.contestQuestion.deleteMany({ where: { contestId: c.id } }),
      db.contestQuestion.createMany({
        data: body.data.items.map((it, i) => ({ contestId: c.id, questionId: it.questionId, orderNo: i + 1, round: it.round, timeLimitSec: it.timeLimitSec ?? null })),
      }),
    ]);
    await refreshIfIdle(c.id);
    return { ok: true };
  });

  // 편성 잠금: 문제 내용·정답을 스냅샷으로 복사 (5.6, C-04)
  app.post<{ Params: { id: string } }>('/api/contests/:id/lock', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const c = await loadForManage(req, reply, user);
    if (!c) return;
    if (c.status !== 'DRAFT') return err(reply, 409, 'INVALID_STATE', '편성 중인 대회만 잠글 수 있어요');
    const cqs = await db.contestQuestion.findMany({
      where: { contestId: c.id },
      orderBy: { orderNo: 'asc' },
      include: { question: { include: { media: true } } },
    });
    if (cqs.filter((q) => q.round !== 'SPARE').length === 0) return err(reply, 400, 'EMPTY', '편성된 문제가 없어요');
    if (c.useRoster && (await db.rosterEntry.count({ where: { contestId: c.id } })) === 0) {
      return err(reply, 400, 'EMPTY_ROSTER', '참가 명단 사용이 켜져 있는데 명단이 비어 있어요. 명단을 올리거나 설정에서 명단 사용을 꺼 주세요');
    }
    const bad = cqs.find((q) => q.question.status !== 'APPROVED');
    if (bad) return err(reply, 400, 'NOT_APPROVED', `승인되지 않은 문제가 있어요: "${bad.question.body.slice(0, 20)}"`);
    await db.$transaction([
      ...cqs.map((cq) => {
        const q = cq.question;
        const snap: CqSnapshot = {
          type: q.type,
          body: q.body,
          mediaUrl: q.media ? `/media/${q.media.path}` : null,
          config: { type: q.type, ...(q.config as object) } as QuestionConfig,
          explanation: q.explanation,
          timeLimitSec: resolveTimeLimit(cq.round, q.type, cq.timeLimitSec, q.timeLimitSec),
        };
        return db.contestQuestion.update({ where: { id: cq.id }, data: { snapshot: snap as unknown as Prisma.InputJsonValue, voided: false } });
      }),
      db.contest.update({ where: { id: c.id }, data: { status: 'LOCKED' } }),
      db.hostLog.create({ data: { contestId: c.id, actorId: user.id, action: 'LOCK', payload: { log: `편성 잠금 (${cqs.length}문제)` } } }),
    ]);
    await dropRuntime(c.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/contests/:id/unlock', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const c = await loadForManage(req, reply, user);
    if (!c) return;
    if (c.status !== 'LOCKED') return err(reply, 409, 'INVALID_STATE', '시작 전 잠긴 대회만 풀 수 있어요');
    await dropRuntime(c.id);
    await db.$transaction([
      db.contestRun.deleteMany({ where: { contestId: c.id } }),
      db.contest.update({ where: { id: c.id }, data: { status: 'DRAFT' } }),
      db.hostLog.create({ data: { contestId: c.id, actorId: user.id, action: 'UNLOCK', payload: { log: '편성 잠금 해제' } } }),
    ]);
    return { ok: true };
  });

  // 참가 명단 (C-05)
  app.get<{ Params: { id: string } }>('/api/contests/:id/roster', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const c = await loadForManage(req, reply, user);
    if (!c) return;
    const rows = await db.rosterEntry.findMany({ where: { contestId: c.id }, orderBy: { studentNo: 'asc' } });
    const res: RosterEntryDTO[] = rows.map((r) => ({ studentNo: r.studentNo, name: r.name, className: r.className }));
    return res;
  });

  app.put<{ Params: { id: string } }>('/api/contests/:id/roster', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const c = await loadForManage(req, reply, user);
    if (!c) return;
    if (c.status === 'LIVE' || c.status === 'FINISHED') return err(reply, 409, 'STARTED', '시작한 대회의 명단은 바꿀 수 없어요');
    const body = rosterSchema.safeParse(req.body);
    if (!body.success) {
      const i = body.error.issues[0];
      const row = typeof i?.path[1] === 'number' ? `${i.path[1] + 1}번째 줄: ` : '';
      return err(reply, 400, 'INVALID', `${row}${i?.message ?? '명단을 확인해 주세요'}`);
    }
    const seen = new Map<string, (typeof body.data.entries)[number]>();
    for (const e of body.data.entries) seen.set(e.studentNo, e); // 같은 학번은 마지막 줄로
    await db.$transaction([
      db.rosterEntry.deleteMany({ where: { contestId: c.id } }),
      db.rosterEntry.createMany({ data: [...seen.values()].map((e) => ({ contestId: c.id, studentNo: e.studentNo, name: e.name, className: e.className || null })) }),
    ]);
    return { ok: true, count: seen.size, duplicates: body.data.entries.length - seen.size };
  });

  // 진행 권한 (A-04)
  app.put<{ Params: { id: string } }>('/api/contests/:id/hosts', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const c = await loadForManage(req, reply, user);
    if (!c) return;
    const body = hostsSchema.safeParse(req.body);
    if (!body.success) return err(reply, 400, 'INVALID', '선생님을 다시 골라 주세요');
    const users = await db.user.findMany({ where: { id: { in: body.data.userIds }, isActive: true }, select: { id: true } });
    const ids = new Set([...users.map((u) => u.id), user.id]);
    await db.$transaction([
      db.contestHost.deleteMany({ where: { contestId: c.id } }),
      db.contestHost.createMany({ data: [...ids].map((userId) => ({ contestId: c.id, userId })) }),
    ]);
    return { ok: true };
  });

  // 무대 링크 다시 만들기
  app.post<{ Params: { id: string } }>('/api/contests/:id/stage-key', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const c = await loadForManage(req, reply, user);
    if (!c) return;
    const stageKey = newToken();
    await db.contest.update({ where: { id: c.id }, data: { stageKey } });
    (await peekRuntime(c.id))?.setStageKey(stageKey);
    return { stageKey };
  });

  // 학생 참가 화면: 대회 제목만 응답
  app.get<{ Params: { code: string } }>('/api/join/:code', async (req, reply) => {
    const ip = reqIp(req);
    if (joinLookupFails.blocked(ip)) return reply.code(429).send({ error: 'RATE_LIMITED', message: '틀린 코드를 너무 많이 넣었어요. 잠시 뒤 다시 해 주세요' });
    if (!/^\d{6}$/.test(req.params.code)) return reply.code(404).send({ error: 'NOT_FOUND' });
    const c = await db.contest.findUnique({ where: { joinCode: req.params.code }, select: { title: true, status: true } });
    if (!c || (c.status !== 'LOCKED' && c.status !== 'LIVE')) {
      joinLookupFails.hit(ip);
      return reply.code(404).send({ error: 'NOT_FOUND', message: '대회 코드를 다시 확인해 주세요' });
    }
    return { title: c.title };
  });

  // 리허설용: 참가자·제출·진행 상태를 지우고 시작 전으로 (관리자만)
  app.post<{ Params: { id: string } }>('/api/contests/:id/reset', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const c = await loadForManage(req, reply, user);
    if (!c) return;
    if (c.status === 'DRAFT') return err(reply, 409, 'INVALID_STATE', '편성을 잠근 대회만 초기화할 수 있어요');
    await dropRuntime(c.id);
    await db.$transaction([
      db.participant.deleteMany({ where: { contestId: c.id } }),
      db.contestRun.deleteMany({ where: { contestId: c.id } }),
      db.contestQuestion.updateMany({ where: { contestId: c.id }, data: { voided: false } }),
      db.contest.update({ where: { id: c.id }, data: { status: 'LOCKED' } }),
      db.hostLog.create({ data: { contestId: c.id, actorId: user.id, action: 'RESET', payload: { log: '리허설 초기화' } } }),
    ]);
    return { ok: true };
  });

  // 결과 (R-01, R-04)
  app.get<{ Params: { id: string } }>('/api/contests/:id/result', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const c = await loadForManage(req, reply, user);
    if (!c) return;
    return buildResult(c.id);
  });

  // CSV 내보내기 (R-02, R-03): 엑셀에서 한글이 깨지지 않게 UTF-8 BOM
  app.get<{ Params: { id: string; kind: string } }>('/api/contests/:id/export/:kind', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const c = await loadForManage(req, reply, user);
    if (!c) return;
    const kind = req.params.kind.replace(/\.csv$/, '');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    let body: string;
    if (kind === 'alive') {
      const ps = await db.participant.findMany({ where: { contestId: c.id, status: 'ALIVE' }, orderBy: { studentNo: 'asc' } });
      body = csv([['학번', '이름'], ...ps.map((p) => [p.studentNo, p.name])]);
    } else {
      const r = await buildResult(c.id);
      if (!r) return err(reply, 404, 'NOT_FOUND', '대회를 찾을 수 없어요');
      if (kind === 'ranking') {
        body = csv([
          ['순위', '학번', '이름', '상태', '탈락한 문제', '부활 횟수', '맞힌 문제', '낸 답'],
          ...r.ranking.map((x) => [x.rank, x.studentNo, x.name, x.status === 'ALIVE' ? '생존' : '탈락', x.eliminatedAtIndex ?? '', x.revivedCount, x.correctCount, x.answeredCount]),
        ]);
      } else if (kind === 'questions') {
        body = csv([
          ['순서', '번호', '라운드', '유형', '문제', '정답', '출제됨', '무효', '대상', '제출', '정답자', '정답률(%)', '평균 응답(초)', '보기별 선택', '많이 나온 오답'],
          ...r.questions.map((q) => [
            q.orderNo,
            q.index ?? '',
            q.round,
            q.type,
            q.body,
            q.answerText,
            q.asked ? 'O' : '',
            q.voided ? 'O' : '',
            q.targets,
            q.submitted,
            q.correct,
            q.targets ? Math.round((q.correct / q.targets) * 100) : '',
            q.avgResponseMs !== null ? (q.avgResponseMs / 1000).toFixed(1) : '',
            q.choiceCounts?.map((n, i) => `${i + 1}번 ${n}`).join(' / ') ?? '',
            q.wrongTop.map((w) => `${w.answer}(${w.count})`).join(' / '),
          ]),
        ]);
      } else if (kind === 'records') {
        const cqs = await db.contestQuestion.findMany({ where: { contestId: c.id } });
        const snapOf = new Map(cqs.map((cq) => [cq.id, cq.snapshot as CqSnapshot | null]));
        const idx = displayIndex(cqs.sort((a, b) => a.orderNo - b.orderNo));
        const subs = await db.submission.findMany({
          where: { contestQuestion: { contestId: c.id } },
          include: { participant: { select: { studentNo: true, name: true } }, contestQuestion: { select: { orderNo: true, round: true, voided: true } } },
          orderBy: [{ contestQuestion: { orderNo: 'asc' } }, { receivedAt: 'asc' }],
        });
        body = csv([
          ['학번', '이름', '순서', '번호', '라운드', '문제', '낸 답', '정답 여부', '판정', '받은 시각', '무효 문제'],
          ...subs.map((s) => {
            const snap = snapOf.get(s.contestQuestionId);
            return [
              s.participant.studentNo,
              s.participant.name,
              s.contestQuestion.orderNo,
              idx.get(s.contestQuestionId) ?? '',
              s.contestQuestion.round,
              snap?.body ?? '',
              formatAnswer(snap?.config ?? null, s.answer as Answer),
              s.isCorrect ? '정답' : '오답',
              s.judgedBy === 'HOST' ? '진행자' : '자동',
              s.receivedAt.toISOString(),
              s.contestQuestion.voided ? 'O' : '',
            ];
          }),
        ]);
      } else {
        return err(reply, 404, 'NOT_FOUND', '없는 내보내기 종류예요');
      }
    }
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="${kind}-${stamp}.csv"`);
    return body;
  });
}
