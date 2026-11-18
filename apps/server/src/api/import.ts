// 계획서 5.2 엑셀 일괄 업로드 (Q-05) + 부록 A 템플릿, 비슷한 문제 경고 (Q-09)
import { inflateRawSync } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import {
  type QuestionConfig,
  type QuestionInput,
  makeInitials,
  normalizeShort,
  questionInputSchema,
} from '@gb/shared';
import { db } from '../lib/db.ts';
import { hasStaffPower, requireUser } from '../lib/auth.ts';
import { listSubjects } from './subjects.ts';

const COLUMNS = ['유형', '과목', '학년', '난이도', '문제', '보기1', '보기2', '보기3', '보기4', '보기5', '정답', '추가정답', '힌트', '단위', '허용오차', '해설', '제한시간', '메모'] as const;
type Col = (typeof COLUMNS)[number];

const EXAMPLES: Partial<Record<Col, string | number>>[] = [
  { 유형: 'OX', 과목: '과학', 학년: 1, 난이도: '쉬움', 문제: '1기압에서 물은 100℃에서 끓는다.', 정답: 'O', 해설: '1기압에서 물의 끓는점은 100℃' },
  { 유형: '객관식', 과목: '역사', 학년: 2, 난이도: '보통', 문제: '훈민정음을 창제한 왕은?', 보기1: '태조', 보기2: '태종', 보기3: '세종', 보기4: '세조', 정답: '3', 해설: '세종이 1443년 창제' },
  { 유형: '단답', 과목: '사회', 학년: 1, 난이도: '쉬움', 문제: '대한민국의 수도는?', 정답: '서울', 추가정답: '서울특별시' },
  { 유형: '초성', 과목: '국어', 학년: 2, 난이도: '보통', 문제: '한글을 만든 조선의 왕은?', 정답: '세종대왕', 추가정답: '세종', 힌트: 'ㅅㅈㄷㅇ', 제한시간: 30 },
  { 유형: '숫자', 과목: '역사', 학년: 2, 난이도: '어려움', 문제: '훈민정음이 반포된 해는?', 정답: '1446', 단위: '년', 허용오차: 0, 제한시간: 20 },
];

const TYPE: Record<string, QuestionConfig['type']> = { OX: 'OX', ox: 'OX', 객관식: 'CHOICE', 단답: 'SHORT', 단답형: 'SHORT', 초성: 'INITIAL', 숫자: 'NUMBER' };
const DIFF: Record<string, 'EASY' | 'NORMAL' | 'HARD'> = { 쉬움: 'EASY', 보통: 'NORMAL', 어려움: 'HARD' };

export type ImportRow = { row: number; ok: boolean; errors: string[]; data: QuestionInput | null; preview: string };

/**
 * xlsx(=zip)를 실제로 풀어 보며 압축 푼 크기 합이 limit 안인지 확인 (압축 폭탄으로 서버 메모리를 터뜨리지 못하게).
 * zip 목차의 크기는 거짓일 수 있어서, 항목마다 limit까지만 풀어 봄
 */
export function zipWithinLimit(buf: Buffer, limit = 40 * 1024 * 1024): boolean {
  try {
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return false;
    const count = buf.readUInt16LE(eocd + 10);
    if (count > 2000) return false;
    let p = buf.readUInt32LE(eocd + 16);
    let budget = limit;
    for (let k = 0; k < count; k++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) return false;
      const method = buf.readUInt16LE(p + 10);
      const csize = buf.readUInt32LE(p + 20);
      const local = buf.readUInt32LE(p + 42);
      p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
      if (buf.readUInt32LE(local) !== 0x04034b50) return false;
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + csize);
      if (method === 0) budget -= data.length;
      else if (method === 8) budget -= inflateRawSync(data, { maxOutputLength: Math.max(1, budget) }).length;
      else return false;
      if (budget < 0) return false;
    }
    return true;
  } catch {
    // 범위를 벗어난 목차, 한도를 넘는 압축 해제(RangeError) 등
    return false;
  }
}

/** CSV 바이트를 글자로. UTF-8(BOM 포함) 우선, 깨지면 한글 윈도우 엑셀의 CP949로 다시 */
export function decodeText(buf: Buffer): string {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('�')) return utf8;
  try {
    return new TextDecoder('euc-kr').decode(buf); // CP949 ⊃ EUC-KR
  } catch {
    return utf8;
  }
}

/** 따옴표("")·줄바꿈을 지키는 작은 CSV 파서 (엑셀이 내보내는 표준 CSV) */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return String(v.result ?? '');
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
}

/** 엑셀 한 줄 → 문제 입력. 사람이 읽을 오류 문장을 모음 */
function parseRow(get: (c: Col) => string, row: number, subjects: string[]): ImportRow {
  const errors: string[] = [];
  const typeRaw = get('유형');
  const type = TYPE[typeRaw];
  if (!type) errors.push(`유형 "${typeRaw || '(빈칸)'}"은 OX·객관식·단답·초성·숫자 중 하나여야 해요`);
  const subject = get('과목');
  if (!subject) errors.push('과목이 비어 있어요');
  else if (!subjects.includes(subject)) errors.push(`과목 "${subject}"은 목록에 없어요 (${subjects.join(', ')})`);
  const difficulty = DIFF[get('난이도')];
  if (!difficulty) errors.push('난이도는 쉬움·보통·어려움 중 하나여야 해요');
  const gradeRaw = get('학년');
  const grade = gradeRaw ? Number(gradeRaw) : null;
  if (gradeRaw && !(grade && [1, 2, 3].includes(grade))) errors.push('학년은 1, 2, 3 중 하나이거나 비워 두세요');
  const body = get('문제');
  if (!body) errors.push('문제가 비어 있어요');
  const answer = get('정답');
  const alts = get('추가정답')
    .split(/[;；]/)
    .map((s) => s.trim())
    .filter(Boolean);

  let config: QuestionConfig | null = null;
  if (type === 'OX') {
    const a = answer.toUpperCase();
    if (a !== 'O' && a !== 'X') errors.push('OX 정답은 O 또는 X예요');
    else config = { type: 'OX', answer: a };
  } else if (type === 'CHOICE') {
    const choices = (['보기1', '보기2', '보기3', '보기4', '보기5'] as Col[]).map(get).filter(Boolean);
    if (choices.length < 2) errors.push('객관식은 보기가 2개 이상 있어야 해요');
    const nums = answer
      .split(/[;,，；\s]+/)
      .filter(Boolean)
      .map(Number);
    if (nums.length === 0 || nums.some((n) => !Number.isInteger(n))) errors.push('객관식 정답은 보기 번호예요 (예: 3, 여러 개면 2;3)');
    else if (nums.some((n) => n < 1 || n > choices.length)) errors.push(`객관식 정답 번호(${nums.find((n) => n < 1 || n > choices.length)})가 보기 개수(${choices.length})보다 커요`);
    else config = { type: 'CHOICE', choices, answers: [...new Set(nums.map((n) => n - 1))] };
  } else if (type === 'SHORT' || type === 'INITIAL') {
    if (!answer) errors.push('정답이 비어 있어요');
    else if (type === 'SHORT') config = { type: 'SHORT', answers: [answer, ...alts] };
    else config = { type: 'INITIAL', answers: [answer, ...alts], hint: get('힌트') || makeInitials(answer) };
  } else if (type === 'NUMBER') {
    const n = Number(answer.replace(/,/g, ''));
    const tolRaw = get('허용오차');
    const tol = tolRaw ? Number(tolRaw) : 0;
    if (!answer || !Number.isFinite(n)) errors.push('숫자 정답이 숫자가 아니에요');
    else if (!Number.isFinite(tol) || tol < 0) errors.push('허용오차는 0 이상의 숫자예요');
    else config = { type: 'NUMBER', answer: n, tolerance: tol, unit: get('단위') || undefined };
  }
  const tl = get('제한시간');
  const timeLimitSec = tl ? Number(tl) : null;
  if (tl && !(Number.isInteger(timeLimitSec) && timeLimitSec! >= 5 && timeLimitSec! <= 120)) errors.push('제한시간은 5–120초이거나 비워 두세요');

  let data: QuestionInput | null = null;
  if (errors.length === 0 && config && difficulty) {
    const candidate = { subject, grade, difficulty, body, config, explanation: get('해설') || null, timeLimitSec, authorNote: get('메모') || null };
    const r = questionInputSchema.safeParse(candidate);
    if (r.success) data = candidate;
    else errors.push(r.error.issues[0]?.message ?? '입력을 확인해 주세요');
  }
  return { row, ok: errors.length === 0, errors, data, preview: body.slice(0, 60) };
}

/** 2-글자 묶음 겹침(Dice)으로 문장 유사도 */
function similarity(a: string, b: string) {
  const grams = (s: string) => {
    const g = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) g.set(s.slice(i, i + 2), (g.get(s.slice(i, i + 2)) ?? 0) + 1);
    return g;
  };
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const ga = grams(a);
  const gb = grams(b);
  let hit = 0;
  for (const [k, n] of ga) hit += Math.min(n, gb.get(k) ?? 0);
  return (2 * hit) / (a.length - 1 + b.length - 1);
}

export async function importRoutes(app: FastifyInstance) {
  app.get('/api/questions/template.xlsx', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('문제');
    ws.columns = COLUMNS.map((c) => ({ header: c, key: c, width: c === '문제' ? 40 : c === '해설' ? 30 : c.startsWith('보기') ? 12 : 10 }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF6FF' } };
    for (const e of EXAMPLES) ws.addRow(e);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const guide = wb.addWorksheet('작성 방법');
    guide.columns = [{ width: 14 }, { width: 80 }];
    [
      ['유형', 'OX, 객관식, 단답, 초성, 숫자 중 하나'],
      ['과목', (await listSubjects()).map((x) => x.name).join(', ')],
      ['학년', '1, 2, 3 또는 비워 두기 (전체)'],
      ['난이도', '쉬움, 보통, 어려움'],
      ['보기1–보기5', '객관식만. 쓴 칸까지만 보기로 읽어요'],
      ['정답', 'OX는 O/X, 객관식은 번호(여러 개면 2;3), 단답·초성은 대표 정답, 숫자는 숫자'],
      ['추가정답', '단답·초성에서 더 인정할 답, ;로 구분'],
      ['힌트', '초성 문제의 초성 (비우면 정답에서 자동으로 만들어요)'],
      ['단위·허용오차', '숫자 문제만. 허용오차는 기본 0'],
      ['제한시간', '초. 비우면 유형별 기본값'],
      ['메모', '관리자만 봐요 (예: 교과서 54쪽)'],
      ['', '예시 줄은 지우고 쓰세요. 이미지는 올린 뒤 웹에서 문제마다 붙여요.'],
    ].forEach((r) => guide.addRow(r));
    guide.getColumn(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('content-disposition', `attachment; filename="goldenbell-template.xlsx"; filename*=UTF-8''${encodeURIComponent('골든벨_문제_템플릿.xlsx')}`);
    return reply.send(Buffer.from(buf));
  });

  // 업로드한 엑셀을 줄마다 검사해서 미리보기만 돌려줌 (저장 안 함)
  app.post('/api/questions/import', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const file = await req.file({ limits: { fileSize: 2 * 1024 * 1024, files: 1 } }).catch(() => undefined);
    if (!file) return reply.code(400).send({ error: 'INVALID', message: '엑셀(.xlsx)이나 CSV 파일을 골라 주세요' });
    const buf = await file.toBuffer().catch(() => null);
    if (!buf || file.file.truncated) return reply.code(413).send({ error: 'TOO_LARGE', message: '2MB까지 올릴 수 있어요' });

    // 맥이든 윈도우든 상관없이: .xlsx(zip)와 CSV(UTF-8·CP949)를 모두 받음
    const isXlsx = buf.length > 1 && buf[0] === 0x50 && buf[1] === 0x4b; // "PK" = zip = xlsx
    const header = new Map<string, number>();
    const bodyRows: Array<{ no: number; get: (c: Col) => string }> = [];
    const readFail = { error: 'INVALID', message: '파일을 읽지 못했어요. 템플릿(.xlsx)이나 CSV로 저장했는지 확인해 주세요' };
    if (isXlsx) {
      if (!zipWithinLimit(buf)) return reply.code(400).send(readFail);
      const wb = new ExcelJS.Workbook();
      try {
        await wb.xlsx.load(buf as unknown as ArrayBuffer);
      } catch {
        return reply.code(400).send(readFail);
      }
      const ws = wb.worksheets[0];
      if (!ws) return reply.code(400).send({ error: 'INVALID', message: '시트가 비어 있어요' });
      ws.getRow(1).eachCell((cell, col) => header.set(cellText(cell.value), col));
      ws.eachRow((r, n) => {
        if (n === 1) return;
        bodyRows.push({ no: n, get: (c) => (header.has(c) ? cellText(r.getCell(header.get(c)!).value) : '') });
      });
    } else {
      const table = parseCsv(decodeText(buf));
      if (!table.length) return reply.code(400).send({ error: 'INVALID', message: '파일이 비어 있어요. 템플릿을 받아서 써 주세요' });
      table[0]!.forEach((name, i) => header.set(name.trim(), i + 1));
      for (let i = 1; i < table.length; i++) {
        const cells = table[i]!;
        bodyRows.push({ no: i + 1, get: (c) => (header.has(c) ? (cells[header.get(c)! - 1] ?? '').trim() : '') });
      }
    }
    const missing = (['유형', '과목', '난이도', '문제', '정답'] as Col[]).filter((c) => !header.has(c));
    if (missing.length) return reply.code(400).send({ error: 'INVALID', message: `첫 줄에 ${missing.join(', ')} 칸이 없어요. 템플릿을 받아서 써 주세요` });
    const subjectNames = (await listSubjects()).map((x) => x.name);
    const rows: ImportRow[] = [];
    for (const { no, get } of bodyRows) {
      if (COLUMNS.every((c) => !get(c))) continue; // 빈 줄
      rows.push(parseRow(get, no, subjectNames));
    }
    if (rows.length > 300) return reply.code(400).send({ error: 'TOO_MANY', message: '한 번에 300문제까지 올릴 수 있어요' });
    return { rows, okCount: rows.filter((r) => r.ok).length };
  });

  // 검사를 통과한 줄만 작성중으로 저장
  app.post('/api/questions/import/commit', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const body = z.object({ items: z.array(questionInputSchema).min(1).max(300) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID', message: '저장할 문제가 없어요' });
    await db.question.createMany({
      data: body.data.items.map((d) => {
        const { type, ...config } = d.config;
        return {
          authorId: user.id,
          subject: d.subject,
          grade: d.grade ?? null,
          difficulty: d.difficulty,
          type,
          body: d.body,
          config,
          explanation: d.explanation,
          timeLimitSec: d.timeLimitSec ?? null,
          authorNote: d.authorNote,
        };
      }),
    });
    return reply.code(201).send({ created: body.data.items.length });
  });

  // 비슷한 문제 (검수할 때 참고)
  app.get<{ Params: { id: string } }>('/api/questions/:id/similar', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!z.string().uuid().safeParse(req.params.id).success) return reply.code(404).send({ error: 'NOT_FOUND' });
    const q = await db.question.findUnique({ where: { id: req.params.id }, select: { id: true, body: true, authorId: true } });
    if (!q || (!hasStaffPower(user) && q.authorId !== user.id)) return reply.code(404).send({ error: 'NOT_FOUND' });
    const base = normalizeShort(q.body);
    const all = await db.question.findMany({
      where: { id: { not: q.id }, status: { in: ['SUBMITTED', 'APPROVED'] } },
      select: { id: true, body: true, status: true, subject: true, author: { select: { name: true } } },
    });
    return all
      .map((o) => ({ id: o.id, body: o.body, status: o.status, subject: o.subject, authorName: o.author.name, score: similarity(base, normalizeShort(o.body)) }))
      .filter((o) => o.score >= 0.7)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  });
}
