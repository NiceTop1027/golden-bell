// 계획서 8.3: 받는 쪽에 맞춘 전체 스냅샷. 학생에게는 공개 전 정답을 절대 넣지 않는다
import {
  type FinishView,
  type HostAlert,
  type HostView,
  type PodiumPlace,
  type PlayerView,
  type ProgressView,
  type PublicQuestion,
  type RevealStats,
  type RevealView,
  type StageView,
  type TimerView,
  type Winner,
  isSimilar,
  normalizeShort,
} from '@gb/shared';
import { answerText, isTextType } from './grading.ts';
import {
  type CQ,
  type GameState,
  aliveIds,
  allowedCommands,
  canJumpToFinal,
  canStartRevival,
  computeRanks,
  currentCq,
  displaySeq,
  effectiveConfig,
  mainSeq,
} from './engine.ts';

export type RuntimeInfo = {
  connected: Set<string>; // 접속 중인 participantId
  hidden?: Set<string>; // 화면을 벗어난 participantId
  alerts: HostAlert[];
  lastAction: string | null;
};

const REVEALED_PHASES = new Set(['REVEALED', 'CONFIRMED']);

function isRevealed(s: GameState): boolean {
  const p = s.run.phase === 'PAUSED' ? s.run.pausedFrom : s.run.phase;
  return p !== null && REVEALED_PHASES.has(p);
}

/** 학생마다 고정된 섞기 순서 (재접속해도 같은 순서) */
function seededOrder<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function shuffleOn(s: GameState, q: CQ): boolean {
  return q.config.type === 'CHOICE' && (q.config.shuffle ?? s.rules.shuffleChoices);
}

export function publicQuestion(s: GameState, q: CQ, viewerSeed: string | null): PublicQuestion {
  const cfg = q.config;
  const base: PublicQuestion = {
    cqId: q.id,
    type: q.type,
    round: q.round,
    kind: s.run.currentCqId === q.id ? s.run.kind : 'NORMAL',
    body: q.body,
    mediaUrl: q.mediaUrl,
  };
  switch (cfg.type) {
    case 'CHOICE': {
      const list = cfg.choices.map((text, i) => ({ i, text }));
      const shuffle = shuffleOn(s, q);
      base.choices = shuffle && viewerSeed ? seededOrder(list, `${viewerSeed}:${q.id}`) : list;
      base.numbered = !shuffle;
      break;
    }
    case 'INITIAL':
      base.hint = cfg.hint;
      break;
    case 'SHORT':
      if (cfg.showLength) base.length = [...(cfg.answers[0] ?? '')].length;
      break;
    case 'NUMBER':
      if (cfg.unit) base.unit = cfg.unit;
      break;
    case 'ORDER':
      base.items = seededOrder(cfg.items, `${viewerSeed ?? 'stage'}:${q.id}`);
      break;
  }
  return base;
}

function timerView(s: GameState): TimerView {
  const r = s.run;
  return {
    endsAt: r.endsAt,
    paused: r.phase === 'PAUSED',
    remainingMs: r.phase === 'PAUSED' ? r.pausedRemainingMs : null,
    durationMs: r.durationMs,
    readingEndsAt: r.readingEndsAt,
  };
}

export function revealStats(s: GameState, q: CQ): RevealStats {
  const cfg = effectiveConfig(s, q);
  const subs = s.subs[q.id] ?? {};
  const targets = s.run.targets;
  const answered = targets.map((id) => subs[id]).filter((x) => x !== undefined);
  const none = targets.length - answered.length;
  switch (cfg.type) {
    case 'OX':
      return {
        type: 'OX',
        o: answered.filter((a) => a.answer === 'O').length,
        x: answered.filter((a) => a.answer === 'X').length,
        none,
      };
    case 'CHOICE':
      return {
        type: 'CHOICE',
        none,
        choices: cfg.choices.map((text, i) => ({
          i,
          text,
          count: answered.filter((a) => a.answer === i).length,
          correct: cfg.answers.includes(i),
        })),
      };
    case 'NUMBER':
      return { type: 'NUMBER', correct: answered.filter((a) => a.isCorrect).length, total: targets.length };
    default: {
      const counts = new Map<string, { answer: string; count: number }>();
      for (const a of answered) {
        if (a.isCorrect || typeof a.answer !== 'string') continue;
        const n = normalizeShort(a.answer);
        if (!n) continue;
        const c = counts.get(n) ?? { answer: a.answer.trim(), count: 0 };
        c.count += 1;
        counts.set(n, c);
      }
      const wrongTop = s.rules.showWrongTop ? [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 3) : [];
      return { type: 'TEXT', correct: answered.filter((a) => a.isCorrect).length, total: targets.length, wrongTop };
    }
  }
}

function revealView(s: GameState, q: CQ): RevealView {
  const cfg = effectiveConfig(s, q);
  return {
    answerText: answerText(cfg, !shuffleOn(s, q)),
    explanation: q.explanation,
    stats: revealStats(s, q),
  };
}

function progress(s: GameState, info: RuntimeInfo): ProgressView {
  const subs = s.run.currentCqId ? (s.subs[s.run.currentCqId] ?? {}) : {};
  const targets = s.run.targets;
  return {
    submitted: targets.filter((id) => subs[id]).length,
    targets: targets.length,
    alive: aliveIds(s).length,
    connected: [...info.connected].filter((id) => s.participants[id]).length,
  };
}

/** 3위 안의 학생을 순위별로 묶음. 학번순 */
function podiumOf(s: GameState): PodiumPlace[] {
  const ranks = computeRanks(s);
  const places = new Map<number, Winner[]>();
  for (const p of Object.values(s.participants).sort((a, b) => a.studentNo.localeCompare(b.studentNo))) {
    const r = ranks.get(p.id);
    if (r === undefined || r > 3) continue;
    places.set(r, [...(places.get(r) ?? []), { name: p.name, studentNo: p.studentNo }]);
  }
  return [...places.entries()].sort((a, b) => a[0] - b[0]).map(([rank, people]) => ({ rank, people }));
}
const hideNo = (f: FinishView): FinishView => ({
  ...f,
  winners: f.winners.map((w) => ({ name: w.name, studentNo: '' })),
  podium: f.podium.map((pl) => ({ rank: pl.rank, people: pl.people.map((w) => ({ name: w.name, studentNo: '' })) })),
});

function base(s: GameState, viewerSeed: string | null) {
  const q = currentCq(s);
  const showQuestion = q && s.run.phase !== 'LOBBY' && s.run.phase !== 'FINISHED';
  const winners = (s.run.finish?.winnerIds ?? []).map((id) => s.participants[id]).filter((p) => p !== undefined);
  return {
    contestId: s.contestId,
    title: s.title,
    phase: s.run.phase,
    pausedFrom: s.run.pausedFrom,
    index: s.run.index,
    total: displaySeq(s).length,
    question: showQuestion ? publicQuestion(s, q, viewerSeed) : null,
    timer: timerView(s),
    aliveCount: aliveIds(s).length,
    joinedCount: Object.keys(s.participants).length,
    reveal: q && showQuestion && isRevealed(s) ? revealView(s, q) : null,
    result: s.run.phase === 'CONFIRMED' || s.run.pausedFrom === 'CONFIRMED' ? s.run.lastResult : null,
    finish: s.run.finish
      ? ({
          winners: winners.map((p) => ({ name: p.name, studentNo: p.studentNo })),
          podium: podiumOf(s),
          goldenBell: s.run.finish.goldenBell,
          bellMissed: s.run.finish.bellMissed === true,
        } satisfies FinishView)
      : null,
  };
}

export function playerView(s: GameState, participantId: string): PlayerView {
  const p = s.participants[participantId]!;
  const q = currentCq(s);
  const sub = q ? s.subs[q.id]?.[participantId] : undefined;
  const revealed = isRevealed(s);
  const b = base(s, participantId);
  const elimQ = p.eliminatedAt ? displaySeq(s).findIndex((d) => d.id === p.eliminatedAt) + 1 : 0;
  return {
    ...b,
    // 학생 화면에는 우승자 학번을 넣지 않음
    finish: b.finish ? hideNo(b.finish) : null,
    me: {
      participantId: p.id,
      name: p.name,
      studentNo: p.studentNo,
      status: p.status,
      eligible: s.run.targets.includes(p.id),
      submitted: sub !== undefined,
      answer: sub?.answer ?? null,
      correct: revealed && sub ? sub.isCorrect : revealed && s.run.targets.includes(p.id) ? false : null,
      eliminatedAtIndex: p.status === 'ELIMINATED' ? (elimQ || null) : null,
      rank: s.run.phase === 'FINISHED' ? (computeRanks(s).get(p.id) ?? null) : null,
    },
  };
}

export function stageView(s: GameState, info: RuntimeInfo): StageView {
  const alive = aliveIds(s);
  const b = base(s, null);
  return {
    ...b,
    // 무대에는 학번을 띄우지 않음 (5.11)
    finish: b.finish ? hideNo(b.finish) : null,
    joinCode: s.joinCode,
    progress: progress(s, info),
    aliveNames:
      s.run.started && alive.length > 0 && alive.length <= s.rules.showAliveNamesAtMost
        ? alive.map((id) => s.participants[id]!.name)
        : null,
    showSubmitCount: s.rules.showSubmitCount,
  };
}

/** 단답 유사 답안 묶음 (진행자 알림) */
function similarAlerts(s: GameState, q: CQ): HostAlert[] {
  if (!isTextType(q.type) || !isRevealed(s)) return [];
  const cfg = effectiveConfig(s, q);
  if (cfg.type !== 'SHORT' && cfg.type !== 'INITIAL') return [];
  const correct = [...cfg.answers.map(normalizeShort), ...s.run.acceptedExtra];
  const groups = new Map<string, { answer: string; count: number }>();
  for (const sub of Object.values(s.subs[q.id] ?? {})) {
    if (sub.isCorrect || typeof sub.answer !== 'string') continue;
    const n = normalizeShort(sub.answer);
    if (!isSimilar(n, correct)) continue;
    const g = groups.get(n) ?? { answer: sub.answer.trim(), count: 0 };
    g.count += 1;
    groups.set(n, g);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([normalized, g]) => ({ id: `sim:${normalized}`, kind: 'SIMILAR', answer: g.answer, normalized, count: g.count }));
}

export function hostView(s: GameState, info: RuntimeInfo): HostView {
  const q = currentCq(s);
  const subs = q ? (s.subs[q.id] ?? {}) : {};
  const b = base(s, null);
  const seq = mainSeq(s);
  const nextQ = seq.slice(s.run.mainPointer).find((x) => !x.voided && !s.run.askedCqIds.includes(x.id) && x.round !== 'REVIVAL');
  const alive = aliveIds(s);
  const disp = displaySeq(s);
  const alerts: HostAlert[] = [...info.alerts];
  if (q) alerts.push(...similarAlerts(s, q));
  const disconnected = s.run.started
    ? alive.filter((id) => !info.connected.has(id)).length
    : Object.keys(s.participants).filter((id) => !info.connected.has(id)).length;
  if (disconnected > 0) alerts.push({ id: 'disc', kind: 'DISCONNECTED', count: disconnected });
  if (canJumpToFinal(s)) alerts.push({ id: 'one', kind: 'ONE_LEFT', name: s.participants[alive[0]!]!.name });

  return {
    ...b,
    joinCode: s.joinCode,
    stageKey: s.stageKey,
    rules: s.rules,
    question:
      q && b.question
        ? {
            ...publicQuestion(s, q, null),
            config: effectiveConfig(s, q),
            explanation: q.explanation,
            timeLimitSec: q.timeLimitSec,
            acceptedExtra: s.run.acceptedExtra,
          }
        : null,
    next: nextQ
      ? {
          index: disp.findIndex((d) => d.id === nextQ.id) + 1,
          round: nextQ.round,
          type: nextQ.type,
          body: nextQ.body,
          answerText: answerText(nextQ.config),
        }
      : null,
    progress: progress(s, info),
    allowed: allowedCommands(s),
    canJumpToFinal: canJumpToFinal(s),
    canRevival: canStartRevival(s),
    sparesLeft: s.questions.filter((x) => x.round === 'SPARE' && !x.voided && !s.run.askedCqIds.includes(x.id)).length,
    participants: Object.values(s.participants)
      .sort((a, b2) => a.studentNo.localeCompare(b2.studentNo))
      .map((p) => {
        const sub = subs[p.id];
        return {
          id: p.id,
          studentNo: p.studentNo,
          name: p.name,
          status: p.status,
          connected: info.connected.has(p.id),
          submitted: sub !== undefined,
          correct: sub ? sub.isCorrect : null,
          answer: sub?.answer ?? null,
          hidden: s.rules.showVisibility && !!info.hidden?.has(p.id),
        };
      }),
    alerts,
    lastAction: info.lastAction,
  };
}
