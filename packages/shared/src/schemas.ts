import { z } from 'zod';
import { DEFAULT_RULES, HOST_COMMANDS } from './types.ts';

// 계획서 10.3: 모든 입력은 zod로 검증 (REST·소켓 공통)

const text = (max: number) => z.string().trim().min(1).max(max);

export const questionConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('OX'), answer: z.enum(['O', 'X']) }),
  z
    .object({
      type: z.literal('CHOICE'),
      choices: z.array(text(80)).min(2).max(5),
      answers: z.array(z.number().int().min(0)).min(1),
      shuffle: z.boolean().optional(),
    })
    .refine((c) => c.answers.every((a) => a < c.choices.length), {
      message: '정답 번호가 보기 개수보다 큽니다',
      path: ['answers'],
    }),
  z.object({ type: z.literal('SHORT'), answers: z.array(text(30)).min(1), showLength: z.boolean().optional() }),
  z.object({ type: z.literal('INITIAL'), answers: z.array(text(30)).min(1), hint: text(30) }),
  z.object({
    type: z.literal('NUMBER'),
    answer: z.number().finite(),
    tolerance: z.number().min(0).optional(),
    unit: z.string().max(10).optional(),
  }),
  z.object({
    type: z.literal('ORDER'),
    items: z.array(z.object({ id: z.string().min(1), text: text(60) })).min(3).max(5),
  }),
]);

export const answerSchema = z.union([
  z.enum(['O', 'X']),
  z.number().int().min(0).max(10),
  z.string().max(30),
  z.array(z.string().max(20)).max(5),
]);

export const rulesSchema = z.object({
  allowEdit: z.boolean(),
  timerStart: z.enum(['HOST', 'AUTO']),
  readSec: z.number().int().min(0).max(15),
  autoClose: z.boolean(),
  allEliminated: z.enum(['ASK', 'AUTO_VOID']),
  revivalEnabled: z.boolean(),
  revivalMaxCount: z.number().int().min(1).max(3),
  revivalMaxPeople: z.number().int().min(1).nullable(),
  oneLeft: z.enum(['SUGGEST_FINAL', 'CONTINUE']),
  exhausted: z.enum(['CO_WIN', 'SUDDEN_DEATH']),
  shuffleChoices: z.boolean(),
  showSubmitCount: z.boolean(),
  showAliveNamesAtMost: z.number().int().min(0).max(50),
  lateJoin: z.enum(['BEFORE_START', 'ALWAYS']),
  showWrongTop: z.boolean(),
  showVisibility: z.boolean(),
});

/** DB에 저장된 규칙이 일부만 있어도 기본값으로 채움 */
export function parseRules(raw: unknown) {
  return rulesSchema.parse({ ...DEFAULT_RULES, ...(typeof raw === 'object' && raw ? raw : {}) });
}

// ── 소켓 입력 ────────────────────────────────────────────────────
export const studentNoSchema = z
  .string()
  .trim()
  .regex(/^\d{4,6}$/, '학번은 숫자 4–6자리입니다');

export const joinSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/),
  studentNo: studentNoSchema,
  // 줄바꿈·글자 방향 뒤집기·보이지 않는 글자 같은 제어 문자는 무대 화면을 어지럽히므로 막음
  name: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[^\p{Cc}\p{Cf}]+$/u, '이름에 쓸 수 없는 글자가 있어요'),
  token: z.string().max(200).optional(),
});

export const submitSchema = z.object({ cqId: z.string().min(1).max(64), answer: answerSchema });

export const hostCommandSchema = z.object({
  commandId: z.string().min(8).max(64),
  type: z.enum(HOST_COMMANDS),
  args: z.record(z.string(), z.unknown()).optional(),
});

export const loginSchema = z.object({
  loginId: z.string().trim().min(1).max(40),
  password: z.string().min(1).max(200),
});

// ── 문제 출제 (계획서 5.2) ───────────────────────────────────────

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

export const questionInputSchema = z.object({
  subject: z.string().trim().min(1, '과목을 골라 주세요').max(20),
  grade: z.number().int().min(1).max(3).nullable().optional(),
  difficulty: z.enum(['EASY', 'NORMAL', 'HARD']),
  body: z.string().trim().min(1, '문제를 입력해 주세요').max(300, '문제는 300자까지 쓸 수 있어요'),
  mediaId: z.string().uuid().nullable().optional(),
  config: questionConfigSchema,
  explanation: optionalText(200),
  timeLimitSec: z.number().int().min(5).max(120).nullable().optional(),
  authorNote: optionalText(300),
});
export type QuestionInput = z.input<typeof questionInputSchema>;

export const reviewSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('APPROVE'), note: z.string().max(300).optional() }),
  z.object({ result: z.literal('REJECT'), note: z.string().trim().min(1, '반려 사유를 적어 주세요').max(300) }),
]);

export const teacherCreateSchema = z.object({
  teachers: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(20),
        loginId: z
          .string()
          .trim()
          .regex(/^[a-z0-9._-]{3,30}$/, '아이디는 영문 소문자·숫자 3–30자예요'),
        subject: z.string().trim().max(20).optional(),
      }),
    )
    .min(1)
    .max(100),
});

// ── 대회 준비 (계획서 5.5·5.6·5.7) ───────────────────────────────
export const contestBaseSchema = z.object({
  title: z.string().trim().min(1, '대회 이름을 입력해 주세요').max(60),
  heldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜를 골라 주세요'),
});
export const contestUpdateSchema = contestBaseSchema.partial().extend({
  useRoster: z.boolean().optional(),
  rules: rulesSchema.partial().optional(),
});

export const lineupSchema = z.object({
  items: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        round: z.enum(['PRELIM', 'MAIN', 'REVIVAL', 'FINAL', 'SPARE']),
        timeLimitSec: z.number().int().min(5).max(120).nullable().optional(),
      }),
    )
    .max(200),
});

export const rosterSchema = z.object({
  entries: z
    .array(
      z.object({
        studentNo: z.string().trim().regex(/^\d{4,6}$/, '학번은 숫자 4–6자리예요'),
        name: z.string().trim().min(1).max(20),
        className: z.string().trim().max(20).optional(),
      }),
    )
    .max(2000),
});

export const hostsSchema = z.object({ userIds: z.array(z.string().uuid()).max(50) });

// 과목 관리 (관리자)
const subjectName = z.string().trim().min(1, '과목 이름을 써 주세요').max(20, '과목 이름은 20자까지예요');
const groupName = z.string().trim().min(1, '묶음 이름을 써 주세요').max(20, '묶음 이름은 20자까지예요');
export const subjectCreateSchema = z.object({ name: subjectName, group: groupName });
export const subjectUpdateSchema = z.object({ name: subjectName.optional(), group: groupName.optional() });
export const subjectOrderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });
export const subjectGroupRenameSchema = z.object({ from: groupName, to: groupName });
