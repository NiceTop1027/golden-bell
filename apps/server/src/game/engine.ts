// 계획서 5.8 진행 상태 흐름. (상태, 명령, 시각) → 상태 변경 + 결과
// 소켓·DB를 모르는 순수 로직. 검증을 먼저 끝낸 뒤에만 상태를 바꾼다
import {
  type Answer,
  type HostCommandType,
  type Phase,
  type QuestionConfig,
  type QuestionKind,
  type QuestionType,
  type ResultCounts,
  type Round,
  type Rules,
  SUBMIT_GRACE_MS,
} from '@gb/shared';
import { applyAnswerChange, grade, isTextType, isValidAnswer } from './grading.ts';

export type CQ = {
  id: string;
  orderNo: number;
  round: Round;
  type: QuestionType;
  body: string;
  mediaUrl: string | null;
  config: QuestionConfig;
  explanation: string | null;
  timeLimitSec: number;
  voided: boolean;
};

export type PState = {
  id: string;
  studentNo: string;
  name: string;
  status: 'ALIVE' | 'ELIMINATED';
  eliminatedAt: string | null;
  eliminatedSeq: number | null;
  revivedCount: number;
  joinedAt: number;
};

export type Sub = {
  participantId: string;
  cqId: string;
  answer: Answer;
  isCorrect: boolean;
  judgedBy: 'AUTO' | 'HOST';
  receivedAt: number;
};

type PSnap = Pick<PState, 'status' | 'eliminatedAt' | 'eliminatedSeq' | 'revivedCount'>;

export type Run = {
  phase: Phase;
  pausedFrom: Phase | null;
  started: boolean;
  currentCqId: string | null;
  kind: QuestionKind;
  targets: string[]; // 문제 공개 시점에 고정한 대상자
  index: number; // 화면 표시 번호
  endsAt: number | null;
  durationMs: number;
  closedAt: number | null;
  readingEndsAt: number | null;
  pausedRemainingMs: number | null;
  pausedReadingMs: number | null;
  revivalUsed: number;
  acceptedExtra: string[]; // 유사 답안으로 인정한 정규화 답
  configOverride: QuestionConfig | null; // 정답 수정
  askedCqIds: string[];
  mainPointer: number;
  confirmSeq: number;
  goldenBell: boolean;
  lastResult: ResultCounts | null;
  noSpare: boolean; // 무효 처리했는데 예비 문제가 없었음
  undo: { participants: Record<string, PSnap>; run: Omit<Run, 'undo'> } | null;
  finish: { winnerIds: string[]; goldenBell: boolean; bellMissed?: boolean } | null;
  /** 결과 통계용: 문제별 대상 인원, 타이머 시작 시각 (예전 기록에는 없을 수 있음) */
  targetCounts?: Record<string, number>;
  timerStarts?: Record<string, number>;
};

export type GameState = {
  contestId: string;
  title: string;
  joinCode: string;
  stageKey: string;
  rules: Rules;
  questions: CQ[]; // orderNo 오름차순
  participants: Record<string, PState>;
  subs: Record<string, Record<string, Sub>>; // cqId → participantId → 제출
  run: Run;
};

/** 실행 후 영속화할 대상 */
export type Dirty = { run: boolean; participants: Set<string>; subsOf: Set<string>; voided: Set<string> };

export type CmdOk = { ok: true; dirty: Dirty; log: string };
export type CmdErr = { ok: false; error: string; message?: string };
export type CmdResult = CmdOk | CmdErr;

const err = (error: string, message?: string): CmdErr => ({ ok: false, error, message });
const newDirty = (): Dirty => ({ run: true, participants: new Set(), subsOf: new Set(), voided: new Set() });

export function initialRun(): Run {
  return {
    phase: 'LOBBY',
    pausedFrom: null,
    started: false,
    currentCqId: null,
    kind: 'NORMAL',
    targets: [],
    index: 0,
    endsAt: null,
    durationMs: 0,
    closedAt: null,
    readingEndsAt: null,
    pausedRemainingMs: null,
    pausedReadingMs: null,
    revivalUsed: 0,
    acceptedExtra: [],
    configOverride: null,
    askedCqIds: [],
    mainPointer: 0,
    confirmSeq: 0,
    goldenBell: false,
    lastResult: null,
    noSpare: false,
    undo: null,
    finish: null,
    targetCounts: {},
    timerStarts: {},
  };
}

// ── 조회 도우미 ──────────────────────────────────────────────────
export const mainSeq = (s: GameState) => s.questions.filter((q) => q.round !== 'SPARE');
export const displaySeq = (s: GameState) => mainSeq(s).filter((q) => q.round !== 'REVIVAL');
export const currentCq = (s: GameState) => s.questions.find((q) => q.id === s.run.currentCqId) ?? null;
export const effectiveConfig = (s: GameState, q: CQ) =>
  q.id === s.run.currentCqId && s.run.configOverride ? s.run.configOverride : q.config;
export const aliveIds = (s: GameState) => Object.values(s.participants).filter((p) => p.status === 'ALIVE').map((p) => p.id);
export const eliminatedIds = (s: GameState) =>
  Object.values(s.participants).filter((p) => p.status === 'ELIMINATED').map((p) => p.id);

const spares = (s: GameState) =>
  s.questions.filter((q) => q.round === 'SPARE' && !q.voided && !s.run.askedCqIds.includes(q.id));

const unusedFinal = (s: GameState) =>
  mainSeq(s).find((q) => q.round === 'FINAL' && !q.voided && !s.run.askedCqIds.includes(q.id)) ?? null;

const unusedRevival = (s: GameState) =>
  mainSeq(s).find((q) => q.round === 'REVIVAL' && !q.voided && !s.run.askedCqIds.includes(q.id)) ?? null;

export const revivalApplicable = (s: GameState) =>
  s.rules.revivalEnabled && s.run.revivalUsed < s.rules.revivalMaxCount && eliminatedIds(s).length > 0;

/** 현재 단계 (일시정지면 멈추기 전 단계) */
const basePhase = (s: GameState): Phase => (s.run.phase === 'PAUSED' ? (s.run.pausedFrom ?? 'LOBBY') : s.run.phase);

export function canJumpToFinal(s: GameState): boolean {
  return (
    s.run.phase === 'CONFIRMED' &&
    s.rules.oneLeft === 'SUGGEST_FINAL' &&
    s.run.kind !== 'FINAL' &&
    aliveIds(s).length === 1 &&
    unusedFinal(s) !== null
  );
}

export function canStartRevival(s: GameState): boolean {
  return s.run.phase === 'CONFIRMED' && revivalApplicable(s) && unusedRevival(s) !== null;
}

/** 지금 누를 수 있는 진행자 버튼 (5.8 진행자 조작 표) */
export function allowedCommands(s: GameState): HostCommandType[] {
  const r = s.run;
  const out: HostCommandType[] = [];
  const p = r.phase;
  if (p === 'FINISHED') return out;
  if (p === 'LOBBY') out.push('START');
  if (p === 'READING') out.push('START_TIMER');
  if (p === 'ANSWERING') out.push('EXTEND', 'CLOSE');
  if (p === 'CLOSED') out.push('REVEAL', 'SET_ANSWER');
  if (p === 'REVEALED') {
    out.push('SET_ANSWER', 'CONFIRM');
    if (currentCq(s) && isTextType(currentCq(s)!.type)) out.push('ACCEPT_SIMILAR');
  }
  if (p === 'CONFIRMED') {
    out.push('NEXT');
    if (r.undo) out.push('UNDO');
    if (canStartRevival(s)) out.push('START_REVIVAL');
  }
  if (['READING', 'ANSWERING', 'CLOSED', 'REVEALED', 'CONFIRMED'].includes(basePhase(s)) && r.currentCqId) {
    const cq = currentCq(s);
    if (cq && !cq.voided) out.push('VOID');
  }
  if (p === 'PAUSED') out.push('RESUME');
  else if (p !== 'LOBBY') out.push('PAUSE');
  if (p !== 'ANSWERING' && r.started) out.push('REVIVE', 'ELIMINATE');
  out.push('FINISH');
  return out;
}

// ── 문제 열기 ────────────────────────────────────────────────────
function openQuestion(s: GameState, q: CQ, kind: QuestionKind, now: number, targets?: string[], keepIndex?: number) {
  const r = s.run;
  const disp = displaySeq(s);
  r.currentCqId = q.id;
  r.kind = kind;
  r.targets = targets ?? (kind === 'REVIVAL' ? eliminatedIds(s) : aliveIds(s));
  r.index =
    keepIndex ?? (kind === 'REVIVAL' ? r.index : kind === 'SUDDEN' ? disp.length : disp.findIndex((d) => d.id === q.id) + 1);
  r.phase = 'READING';
  r.pausedFrom = null;
  r.endsAt = null;
  r.closedAt = null;
  r.durationMs = q.timeLimitSec * 1000;
  r.readingEndsAt = s.rules.timerStart === 'AUTO' ? now + s.rules.readSec * 1000 : null;
  r.acceptedExtra = [];
  r.configOverride = null;
  r.lastResult = null;
  r.noSpare = false;
  r.undo = null;
  r.askedCqIds.push(q.id);
  s.subs[q.id] = {};
  (r.targetCounts ??= {})[q.id] = r.targets.length;
}

/** 우승자 결정 후 종료 */
function finish(s: GameState) {
  const alive = aliveIds(s);
  let winnerIds = alive;
  if (alive.length === 0) {
    // 전원 탈락 상태로 끝나면 가장 늦게 탈락한 학생들이 공동 1위
    const maxSeq = Math.max(0, ...Object.values(s.participants).map((p) => p.eliminatedSeq ?? 0));
    winnerIds = Object.values(s.participants)
      .filter((p) => p.eliminatedSeq === maxSeq && maxSeq > 0)
      .map((p) => p.id);
  }
  s.run.phase = 'FINISHED';
  s.run.pausedFrom = null;
  s.run.endsAt = null;
  s.run.readingEndsAt = null;
  s.run.finish = { winnerIds, goldenBell: s.run.goldenBell, bellMissed: s.run.lastResult?.bell === 'MISS' };
}

/** 다음 문제로 (NEXT, START 공용) */
function advance(s: GameState, now: number, jump?: 'FINAL'): CmdErr | null {
  const r = s.run;
  const alive = aliveIds(s);

  if (jump === 'FINAL') {
    const f = unusedFinal(s);
    if (!f) return err('NO_FINAL', '남은 골든벨 문제가 없습니다');
    r.mainPointer = mainSeq(s).findIndex((q) => q.id === f.id) + 1;
    openQuestion(s, f, 'FINAL', now);
    return null;
  }

  // 결승 문제를 확정했고 생존자가 1명 이하 → 종료
  if (r.started && r.kind === 'FINAL' && r.phase === 'CONFIRMED' && alive.length <= 1) {
    finish(s);
    return null;
  }

  if (r.started && alive.length === 0) {
    const rq = unusedRevival(s);
    if (revivalApplicable(s) && rq) {
      openQuestion(s, rq, 'REVIVAL', now);
      return null;
    }
    finish(s);
    return null;
  }

  // 서든데스로 1명이 남으면 종료
  if (r.kind === 'SUDDEN' && r.phase === 'CONFIRMED' && alive.length === 1) {
    finish(s);
    return null;
  }

  const seq = mainSeq(s);
  for (let i = r.mainPointer; i < seq.length; i++) {
    const q = seq[i]!;
    if (q.voided || r.askedCqIds.includes(q.id)) continue;
    if (q.round === 'REVIVAL') {
      if (revivalApplicable(s)) {
        r.mainPointer = i + 1;
        openQuestion(s, q, 'REVIVAL', now);
        return null;
      }
      continue;
    }
    r.mainPointer = i + 1;
    openQuestion(s, q, q.round === 'FINAL' ? 'FINAL' : 'NORMAL', now);
    return null;
  }

  // 문제 소진
  r.mainPointer = seq.length;
  if (alive.length > 1 && s.rules.exhausted === 'SUDDEN_DEATH') {
    const sp = spares(s)[0];
    if (sp) {
      openQuestion(s, sp, 'SUDDEN', now);
      return null;
    }
  }
  finish(s);
  return null;
}

function snapshotForUndo(s: GameState) {
  const participants: Record<string, PSnap> = {};
  for (const p of Object.values(s.participants)) {
    participants[p.id] = {
      status: p.status,
      eliminatedAt: p.eliminatedAt,
      eliminatedSeq: p.eliminatedSeq,
      revivedCount: p.revivedCount,
    };
  }
  const { undo: _u, ...run } = s.run;
  return { participants, run: structuredClone(run) };
}

function restoreUndo(s: GameState, d: Dirty) {
  const u = s.run.undo;
  if (!u) return;
  for (const [id, snap] of Object.entries(u.participants)) {
    const p = s.participants[id];
    if (!p) continue;
    if (p.status !== snap.status || p.eliminatedSeq !== snap.eliminatedSeq || p.revivedCount !== snap.revivedCount) {
      d.participants.add(id);
    }
    Object.assign(p, snap);
  }
  s.run = { ...structuredClone(u.run), undo: null };
}

/** 현재 문제 전체 재채점 (정답 수정·유사 답안 인정) */
function regrade(s: GameState, q: CQ, d: Dirty, judgedBy: 'AUTO' | 'HOST') {
  const cfg = effectiveConfig(s, q);
  for (const sub of Object.values(s.subs[q.id] ?? {})) {
    const next = grade(cfg, s.run.acceptedExtra, sub.answer);
    if (next !== sub.isCorrect) {
      sub.isCorrect = next;
      sub.judgedBy = judgedBy;
    }
  }
  d.subsOf.add(q.id);
}

// ── 명령 실행 ────────────────────────────────────────────────────
export function applyCommand(
  s: GameState,
  type: HostCommandType,
  args: Record<string, unknown> = {},
  now: number,
): CmdResult {
  if (!allowedCommands(s).includes(type)) return err('INVALID_STATE', `${s.run.phase} 상태에서는 ${type}을(를) 할 수 없습니다`);
  const r = s.run;
  const d = newDirty();
  const cq = currentCq(s);

  switch (type) {
    case 'START': {
      if (Object.keys(s.participants).length === 0) return err('NO_PLAYERS', '참가한 학생이 없습니다');
      if (mainSeq(s).length === 0) return err('NO_QUESTIONS', '편성된 문제가 없습니다');
      r.started = true;
      const e = advance(s, now);
      if (e) return e;
      return { ok: true, dirty: d, log: '대회 시작' };
    }
    case 'START_TIMER': {
      r.phase = 'ANSWERING';
      r.readingEndsAt = null;
      r.endsAt = now + r.durationMs;
      if (r.currentCqId) (r.timerStarts ??= {})[r.currentCqId] = now;
      return { ok: true, dirty: d, log: '타이머 시작' };
    }
    case 'EXTEND': {
      const sec = typeof args.sec === 'number' && args.sec > 0 && args.sec <= 60 ? args.sec : 10;
      r.endsAt = (r.endsAt ?? now) + sec * 1000;
      r.durationMs += sec * 1000;
      return { ok: true, dirty: d, log: `+${sec}초` };
    }
    case 'CLOSE': {
      // 자동 마감은 마감 시각 기준, 즉시 마감은 지금 기준
      const at = args.auto === true && r.endsAt ? r.endsAt : now;
      r.phase = 'CLOSED';
      r.closedAt = at;
      r.endsAt = at;
      return { ok: true, dirty: d, log: args.auto ? '자동 마감' : '즉시 마감' };
    }
    case 'REVEAL': {
      if (r.closedAt !== null && now < r.closedAt + SUBMIT_GRACE_MS) return err('GRACE', '마감 직후 유예 시간입니다');
      r.phase = 'REVEALED';
      return { ok: true, dirty: d, log: '정답 공개' };
    }
    case 'SET_ANSWER': {
      if (!cq) return err('INVALID_STATE');
      const next = applyAnswerChange(effectiveConfig(s, cq), args);
      if (!next) return err('INVALID', '정답 형식이 맞지 않습니다');
      r.configOverride = next;
      regrade(s, cq, d, 'HOST');
      return { ok: true, dirty: d, log: '정답 수정' };
    }
    case 'ACCEPT_SIMILAR': {
      if (!cq) return err('INVALID_STATE');
      const n = typeof args.normalized === 'string' ? args.normalized : '';
      if (!n) return err('INVALID');
      if (!r.acceptedExtra.includes(n)) r.acceptedExtra.push(n);
      regrade(s, cq, d, 'HOST');
      return { ok: true, dirty: d, log: `유사 답안 인정: ${n}` };
    }
    case 'CONFIRM': {
      if (!cq) return err('INVALID_STATE');
      const subs = s.subs[cq.id] ?? {};
      const correct = r.targets.filter((id) => subs[id]?.isCorrect);
      const wrong = r.targets.filter((id) => !subs[id]?.isCorrect);

      if (r.kind === 'REVIVAL') {
        r.undo = snapshotForUndo(s);
        const ordered = correct.sort((a, b) => subs[a]!.receivedAt - subs[b]!.receivedAt);
        const revived = s.rules.revivalMaxPeople ? ordered.slice(0, s.rules.revivalMaxPeople) : ordered;
        for (const id of revived) {
          const p = s.participants[id]!;
          p.status = 'ALIVE';
          p.eliminatedSeq = null;
          p.eliminatedAt = null;
          p.revivedCount += 1;
          d.participants.add(id);
        }
        r.revivalUsed += 1;
        r.confirmSeq += 1;
        r.lastResult = { eliminatedNow: 0, revivedNow: revived.length, alive: aliveIds(s).length };
        r.phase = 'CONFIRMED';
        return { ok: true, dirty: d, log: `패자부활 확정: ${revived.length}명 부활` };
      }

      if (r.kind === 'FINAL' && r.targets.length === 1) {
        // 골든벨 문제: 틀려도 우승 (계획서 19장 #8 임시 결정)
        r.undo = snapshotForUndo(s);
        r.goldenBell = correct.length === 1;
        r.confirmSeq += 1;
        r.lastResult = { eliminatedNow: 0, revivedNow: 0, alive: aliveIds(s).length, bell: r.goldenBell ? 'SUCCESS' : 'MISS' };
        r.phase = 'CONFIRMED';
        return { ok: true, dirty: d, log: r.goldenBell ? '골든벨 달성' : '골든벨 문제 오답 (최종 우승은 유지)' };
      }

      if (r.targets.length > 0 && wrong.length === r.targets.length && args.force !== true) {
        if (s.rules.allEliminated === 'AUTO_VOID') return applyCommand(s, 'VOID', { reason: '전원 탈락 자동 무효' }, now);
        return err('ALL_ELIMINATED', '전원 탈락합니다');
      }

      r.undo = snapshotForUndo(s);
      r.confirmSeq += 1;
      for (const id of wrong) {
        const p = s.participants[id]!;
        if (p.status !== 'ALIVE') continue;
        p.status = 'ELIMINATED';
        p.eliminatedAt = cq.id;
        p.eliminatedSeq = r.confirmSeq;
        d.participants.add(id);
      }
      r.lastResult = { eliminatedNow: wrong.length, revivedNow: 0, alive: aliveIds(s).length };
      r.phase = 'CONFIRMED';
      return { ok: true, dirty: d, log: `탈락 확정: ${wrong.length}명 탈락` };
    }
    case 'UNDO': {
      restoreUndo(s, d);
      return { ok: true, dirty: d, log: '되돌리기' };
    }
    case 'NEXT': {
      const e = advance(s, now, args.jump === 'FINAL' ? 'FINAL' : undefined);
      if (e) return e;
      return { ok: true, dirty: d, log: s.run.phase === 'FINISHED' ? '대회 종료' : '다음 문제' };
    }
    case 'START_REVIVAL': {
      const rq = unusedRevival(s);
      if (!rq) return err('NO_REVIVAL', '남은 패자부활 문제가 없습니다');
      openQuestion(s, rq, 'REVIVAL', now);
      return { ok: true, dirty: d, log: '패자부활 시작' };
    }
    case 'VOID': {
      if (!cq) return err('INVALID_STATE');
      if (basePhase(s) === 'CONFIRMED') restoreUndo(s, d);
      const kind = s.run.kind;
      const targets = s.run.targets;
      const index = s.run.index;
      cq.voided = true;
      d.voided.add(cq.id);
      delete s.subs[cq.id];
      const sp = spares(s)[0];
      if (sp) {
        openQuestion(s, sp, kind, now, targets, index);
      } else {
        s.run.phase = 'CONFIRMED';
        s.run.pausedFrom = null;
        s.run.endsAt = null;
        s.run.undo = null;
        s.run.noSpare = true;
        s.run.lastResult = { eliminatedNow: 0, revivedNow: 0, alive: aliveIds(s).length };
      }
      const reason = typeof args.reason === 'string' ? ` (${args.reason})` : '';
      return { ok: true, dirty: d, log: `문제 무효${sp ? ' → 예비 문제' : ' (예비 없음)'}${reason}` };
    }
    case 'PAUSE': {
      r.pausedFrom = r.phase;
      if (r.phase === 'ANSWERING' && r.endsAt !== null) {
        r.pausedRemainingMs = Math.max(0, r.endsAt - now);
        r.endsAt = null;
      }
      if (r.phase === 'READING' && r.readingEndsAt !== null) {
        r.pausedReadingMs = Math.max(0, r.readingEndsAt - now);
        r.readingEndsAt = null;
      }
      r.phase = 'PAUSED';
      return { ok: true, dirty: d, log: '일시정지' };
    }
    case 'RESUME': {
      r.phase = r.pausedFrom ?? 'LOBBY';
      r.pausedFrom = null;
      if (r.phase === 'ANSWERING' && r.pausedRemainingMs !== null) r.endsAt = now + r.pausedRemainingMs;
      if (r.phase === 'READING' && r.pausedReadingMs !== null) r.readingEndsAt = now + r.pausedReadingMs;
      r.pausedRemainingMs = null;
      r.pausedReadingMs = null;
      return { ok: true, dirty: d, log: '재개' };
    }
    case 'REVIVE':
    case 'ELIMINATE': {
      const id = typeof args.participantId === 'string' ? args.participantId : '';
      const p = s.participants[id];
      if (!p) return err('NOT_FOUND', '학생을 찾을 수 없습니다');
      const reason = typeof args.reason === 'string' ? args.reason.slice(0, 200) : '';
      if (!reason) return err('INVALID', '사유를 입력해주세요');
      if (type === 'REVIVE') {
        if (p.status === 'ALIVE') return err('INVALID', '이미 생존 상태입니다');
        p.status = 'ALIVE';
        p.eliminatedSeq = null;
        p.eliminatedAt = null;
        p.revivedCount += 1;
      } else {
        if (p.status === 'ELIMINATED') return err('INVALID', '이미 탈락 상태입니다');
        p.status = 'ELIMINATED';
        p.eliminatedAt = r.currentCqId;
        p.eliminatedSeq = Math.max(1, r.confirmSeq);
      }
      r.undo = null; // 개별 조작 뒤에는 직전 확정 되돌리기를 막음
      d.participants.add(id);
      return { ok: true, dirty: d, log: `${type === 'REVIVE' ? '개별 부활' : '개별 탈락'}: ${p.studentNo} ${p.name} (${reason})` };
    }
    case 'FINISH': {
      finish(s);
      return { ok: true, dirty: d, log: '대회 종료' };
    }
    case 'APPROVE_DEVICE':
    case 'REJECT_DEVICE':
      return err('INVALID_STATE', '런타임에서 처리하는 명령입니다');
  }
}

// ── 제출 ─────────────────────────────────────────────────────────
export type SubmitResult = { ok: true; sub: Sub } | { ok: false; error: 'CLOSED' | 'LOCKED' | 'NOT_ALIVE' | 'INVALID' };

export function submit(s: GameState, participantId: string, cqId: string, answer: Answer, now: number): SubmitResult {
  const r = s.run;
  const q = currentCq(s);
  if (!q || q.id !== cqId) return { ok: false, error: 'CLOSED' };
  const inTime =
    (r.phase === 'ANSWERING' && (r.endsAt === null || now <= r.endsAt + SUBMIT_GRACE_MS)) ||
    (r.phase === 'CLOSED' && r.closedAt !== null && now <= r.closedAt + SUBMIT_GRACE_MS);
  if (!inTime) return { ok: false, error: 'CLOSED' };
  if (!r.targets.includes(participantId)) return { ok: false, error: 'NOT_ALIVE' };
  const cfg = effectiveConfig(s, q);
  if (!isValidAnswer(cfg, answer)) return { ok: false, error: 'INVALID' };
  const bucket = (s.subs[q.id] ??= {});
  if (bucket[participantId] && !s.rules.allowEdit) return { ok: false, error: 'LOCKED' };
  const sub: Sub = {
    participantId,
    cqId: q.id,
    answer,
    isCorrect: grade(cfg, r.acceptedExtra, answer),
    judgedBy: 'AUTO',
    receivedAt: now,
  };
  bucket[participantId] = sub;
  return { ok: true, sub };
}

/** 서버 재시작 복구: 답변 중이었다면 남은 시간을 계산해 일시정지로 (8.7) */
export function recoverRun(s: GameState, now: number) {
  const r = s.run;
  if (r.phase === 'ANSWERING') {
    r.pausedFrom = 'ANSWERING';
    r.pausedRemainingMs = Math.max(0, (r.endsAt ?? now) - now);
    r.endsAt = null;
    r.phase = 'PAUSED';
  } else if (r.phase === 'READING' && r.readingEndsAt !== null) {
    r.pausedFrom = 'READING';
    r.pausedReadingMs = Math.max(0, r.readingEndsAt - now);
    r.readingEndsAt = null;
    r.phase = 'PAUSED';
  }
}

/** 순위: 생존자 1위, 늦게 탈락할수록 높음, 같은 확정에서 탈락하면 같은 순위 (5.8) */
export function computeRanks(s: GameState): Map<string, number> {
  const ps = Object.values(s.participants);
  const winners = new Set(s.run.finish?.winnerIds ?? []);
  const score = (p: PState) => (winners.has(p.id) || p.status === 'ALIVE' ? Number.MAX_SAFE_INTEGER : (p.eliminatedSeq ?? 0));
  const ranks = new Map<string, number>();
  for (const p of ps) {
    const sc = score(p);
    ranks.set(p.id, 1 + ps.filter((o) => score(o) > sc).length);
  }
  return ranks;
}
