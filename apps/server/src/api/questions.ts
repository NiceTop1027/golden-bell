// 계획서 5.2·5.4·9장: 문제 작성·제출·회수·검수
//   작성중 ─제출→ 제출됨 ─승인→ 승인됨
//     ▲            └반려(사유)→ 반려됨 ─제출→ 제출됨
//     └──회수──────┘
//   승인된 문제를 선생님이 고치면 다시 제출됨 (재검수)
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  type QuestionConfig,
  type QuestionDTO,
  type QuestionListDTO,
  type QuestionStatus,
  questionInputSchema,
  reviewSchema,
} from '@gb/shared';
import { db, type Prisma } from '../lib/db.ts';
import { type AuthUser, hasStaffPower, requireUser } from '../lib/auth.ts';
import { subjectExists } from './subjects.ts';

export const include = {
  author: { select: { name: true } },
  media: { select: { path: true } },
  _count: { select: { contestQuestions: true } },
} as const;

type Row = Prisma.QuestionGetPayload<{ include: typeof include }>;

export function toDTO(q: Row, viewer: AuthUser): QuestionDTO {
  return {
    id: q.id,
    authorId: q.authorId,
    authorName: q.author.name,
    subject: q.subject,
    grade: q.grade,
    difficulty: q.difficulty,
    type: q.type,
    body: q.body,
    mediaId: q.mediaId,
    mediaUrl: q.media ? `/media/${q.media.path}` : null,
    config: { type: q.type, ...(q.config as object) } as QuestionConfig,
    explanation: q.explanation,
    timeLimitSec: q.timeLimitSec,
    // 출제자 메모는 관리자와 작성자만
    authorNote: hasStaffPower(viewer) || viewer.id === q.authorId ? q.authorNote : null,
    status: q.status,
    reviewNote: q.reviewNote,
    usedInContests: q._count.contestQuestions,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  };
}

const err = (reply: FastifyReply, code: number, error: string, message: string) => reply.code(code).send({ error, message });

/** zod 오류를 사람이 읽을 첫 문장으로 */
function firstIssue(e: z.ZodError) {
  const i = e.issues[0];
  if (!i) return '입력을 확인해 주세요';
  if (i.path[0] === 'config') return i.message.startsWith('정답') ? i.message : '정답과 보기를 확인해 주세요';
  return i.message;
}

/** 저장 형식: config에서 type은 빼고 저장 (type은 컬럼) */
function splitConfig(cfg: QuestionConfig) {
  const { type, ...rest } = cfg;
  return { type, config: rest as Prisma.InputJsonValue };
}

async function load(id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  return db.question.findUnique({ where: { id }, include });
}

function canSee(user: AuthUser, q: { authorId: string }) {
  return hasStaffPower(user) || q.authorId === user.id;
}

export async function questionRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { status?: string; type?: string; subject?: string; author?: string } }>('/api/questions', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const mine = !hasStaffPower(user) || req.query.author === 'me';
    const scope: Prisma.QuestionWhereInput = mine ? { authorId: user.id } : req.query.author ? { authorId: req.query.author } : {};
    const where: Prisma.QuestionWhereInput = { ...scope };
    if (req.query.status) where.status = req.query.status as QuestionStatus;
    if (req.query.type) where.type = req.query.type as never;
    if (req.query.subject) where.subject = req.query.subject;
    const [rows, grouped, bySubject] = await Promise.all([
      db.question.findMany({ where, include, orderBy: [{ updatedAt: 'desc' }], take: 500 }),
      db.question.groupBy({ by: ['status'], where: scope, _count: true }),
      db.question.groupBy({ by: ['subject'], where: { ...scope, status: 'APPROVED' }, _count: true }),
    ]);
    const counts: Record<QuestionStatus, number> = { DRAFT: 0, SUBMITTED: 0, APPROVED: 0, REJECTED: 0 };
    for (const g of grouped) counts[g.status] = g._count;
    const approvedBySubject: Record<string, number> = {};
    for (const g of bySubject) approvedBySubject[g.subject] = g._count;
    const res: QuestionListDTO = { items: rows.map((r) => toDTO(r, user)), counts, approvedBySubject };
    return res;
  });

  app.get<{ Params: { id: string } }>('/api/questions/:id', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const q = await load(req.params.id);
    if (!q || !canSee(user, q)) return err(reply, 404, 'NOT_FOUND', '문제를 찾을 수 없어요');
    return toDTO(q, user);
  });

  app.post('/api/questions', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const body = questionInputSchema.safeParse(req.body);
    if (!body.success) return err(reply, 400, 'INVALID', firstIssue(body.error));
    if (!(await subjectExists(body.data.subject))) return err(reply, 400, 'INVALID', `과목 "${body.data.subject}"은 목록에 없어요. 다시 골라 주세요`);
    const d = body.data;
    if (d.mediaId && !(await db.media.findFirst({ where: { id: d.mediaId, uploaderId: user.id } }))) {
      return err(reply, 400, 'INVALID', '첨부한 이미지를 찾을 수 없어요');
    }
    const { type, config } = splitConfig(d.config);
    const q = await db.question.create({
      data: {
        authorId: user.id,
        subject: d.subject,
        grade: d.grade ?? null,
        difficulty: d.difficulty,
        type,
        body: d.body,
        mediaId: d.mediaId ?? null,
        config,
        explanation: d.explanation,
        timeLimitSec: d.timeLimitSec ?? null,
        authorNote: d.authorNote,
      },
      include,
    });
    return reply.code(201).send(toDTO(q, user));
  });

  app.patch<{ Params: { id: string } }>('/api/questions/:id', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const q = await load(req.params.id);
    if (!q || !canSee(user, q)) return err(reply, 404, 'NOT_FOUND', '문제를 찾을 수 없어요');
    const isAuthor = q.authorId === user.id;
    if (isAuthor && !hasStaffPower(user) && q.status === 'SUBMITTED') {
      return err(reply, 409, 'LOCKED', '검수 중인 문제예요. 회수한 뒤에 고칠 수 있어요');
    }
    const body = questionInputSchema.safeParse(req.body);
    if (!body.success) return err(reply, 400, 'INVALID', firstIssue(body.error));
    if (!(await subjectExists(body.data.subject))) return err(reply, 400, 'INVALID', `과목 "${body.data.subject}"은 목록에 없어요. 다시 골라 주세요`);
    const d = body.data;
    if (d.mediaId && d.mediaId !== q.mediaId && !(await db.media.findFirst({ where: { id: d.mediaId, uploaderId: user.id } }))) {
      return err(reply, 400, 'INVALID', '첨부한 이미지를 찾을 수 없어요');
    }
    const { type, config } = splitConfig(d.config);
    // 승인된 문제를 선생님이 고치면 재검수 (관리자가 고치면 상태 유지)
    const status: QuestionStatus = q.status === 'APPROVED' && !hasStaffPower(user) ? 'SUBMITTED' : q.status;
    const updated = await db.question.update({
      where: { id: q.id },
      data: {
        subject: d.subject,
        grade: d.grade ?? null,
        difficulty: d.difficulty,
        type,
        body: d.body,
        mediaId: d.mediaId ?? null,
        config,
        explanation: d.explanation,
        timeLimitSec: d.timeLimitSec ?? null,
        authorNote: d.authorNote,
        status,
      },
      include,
    });
    return toDTO(updated, user);
  });

  app.delete<{ Params: { id: string } }>('/api/questions/:id', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const q = await load(req.params.id);
    if (!q || !canSee(user, q)) return err(reply, 404, 'NOT_FOUND', '문제를 찾을 수 없어요');
    if (q.status !== 'DRAFT' && q.status !== 'REJECTED') return err(reply, 409, 'LOCKED', '작성중이거나 반려된 문제만 지울 수 있어요');
    if (q._count.contestQuestions > 0) return err(reply, 409, 'IN_USE', '대회에 편성된 문제는 지울 수 없어요');
    await db.question.delete({ where: { id: q.id } });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/questions/:id/submit', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const q = await load(req.params.id);
    if (!q || q.authorId !== user.id) return err(reply, 404, 'NOT_FOUND', '문제를 찾을 수 없어요');
    if (q.status !== 'DRAFT' && q.status !== 'REJECTED') return err(reply, 409, 'INVALID_STATE', '이미 제출했거나 승인된 문제예요');
    const updated = await db.question.update({ where: { id: q.id }, data: { status: 'SUBMITTED' }, include });
    return toDTO(updated, user);
  });

  app.post<{ Params: { id: string } }>('/api/questions/:id/withdraw', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const q = await load(req.params.id);
    if (!q || q.authorId !== user.id) return err(reply, 404, 'NOT_FOUND', '문제를 찾을 수 없어요');
    if (q.status !== 'SUBMITTED') return err(reply, 409, 'INVALID_STATE', '검수 중인 문제만 회수할 수 있어요');
    const updated = await db.question.update({ where: { id: q.id }, data: { status: 'DRAFT' }, include });
    return toDTO(updated, user);
  });

  app.post<{ Params: { id: string } }>('/api/questions/:id/review', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const body = reviewSchema.safeParse(req.body);
    if (!body.success) return err(reply, 400, 'INVALID', firstIssue(body.error));
    const q = await load(req.params.id);
    if (!q) return err(reply, 404, 'NOT_FOUND', '문제를 찾을 수 없어요');
    if (q.status !== 'SUBMITTED') return err(reply, 409, 'INVALID_STATE', '제출된 문제만 검수할 수 있어요');
    const approve = body.data.result === 'APPROVE';
    const updated = await db.question.update({
      where: { id: q.id },
      data: { status: approve ? 'APPROVED' : 'REJECTED', reviewNote: approve ? null : body.data.note },
      include,
    });
    return toDTO(updated, user);
  });
}
