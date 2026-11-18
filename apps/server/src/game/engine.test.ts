import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type QuestionConfig, type Rules, SUBMIT_GRACE_MS } from '@gb/shared';
import { type CQ, type GameState, aliveIds, allowedCommands, applyCommand, computeRanks, initialRun, recoverRun, submit } from './engine.ts';
import { grade } from './grading.ts';
import { playerView, stageView } from './views.ts';

let n = 0;
function q(round: CQ['round'], config: QuestionConfig, timeLimitSec = 10): CQ {
  n += 1;
  return {
    id: `q${n}`,
    orderNo: n,
    round,
    type: config.type,
    body: `문제 ${n}`,
    mediaUrl: null,
    config,
    explanation: null,
    timeLimitSec,
    voided: false,
  };
}

const OX_O: QuestionConfig = { type: 'OX', answer: 'O' };
const CHOICE: QuestionConfig = { type: 'CHOICE', choices: ['태조', '태종', '세종', '세조'], answers: [2] };
const SHORT: QuestionConfig = { type: 'SHORT', answers: ['세종대왕', '세종'] };

function game(questions: CQ[], players = 3, rules: Partial<Rules> = {}): GameState {
  const participants: GameState['participants'] = {};
  for (let i = 1; i <= players; i++) {
    participants[`p${i}`] = {
      id: `p${i}`,
      studentNo: `1010${i}`,
      name: `학생${i}`,
      status: 'ALIVE',
      eliminatedAt: null,
      eliminatedSeq: null,
      revivedCount: 0,
      joinedAt: 0,
    };
  }
  return {
    contestId: 'c1',
    title: '테스트',
    joinCode: '123456',
    stageKey: 'k',
    rules: { ...DEFAULT_RULES, ...rules },
    questions,
    participants,
    subs: {},
    run: initialRun(),
  };
}

function ok(s: GameState, type: Parameters<typeof applyCommand>[1], args: Record<string, unknown> = {}, now = 1000) {
  const r = applyCommand(s, type, args, now);
  if (!r.ok) throw new Error(`${type} 실패: ${r.error}`);
  return r;
}

/** 문제 하나를 공개→제출→마감→공개→확정까지 */
function play(s: GameState, answers: Record<string, unknown>, t = 10_000) {
  ok(s, 'START_TIMER', {}, t);
  for (const [pid, a] of Object.entries(answers)) {
    const r = submit(s, pid, s.run.currentCqId!, a as never, t + 100);
    if (!r.ok) throw new Error(`제출 실패 ${pid}: ${r.error}`);
  }
  ok(s, 'CLOSE', {}, t + 200);
  ok(s, 'REVEAL', {}, t + 200 + SUBMIT_GRACE_MS);
  return applyCommand(s, 'CONFIRM', {}, t + 2000);
}

describe('채점', () => {
  it('단답 정규화: 공백·문장부호·전각·대소문자', () => {
    expect(grade(SHORT, [], ' 세종 대왕! ')).toBe(true);
    expect(grade(SHORT, [], '세종')).toBe(true);
    expect(grade(SHORT, [], '세종대앙')).toBe(false);
    expect(grade({ type: 'SHORT', answers: ['DNA'] }, [], 'ｄｎａ')).toBe(true);
  });
  it('숫자 허용 오차, 쉼표', () => {
    const cfg: QuestionConfig = { type: 'NUMBER', answer: 1446, tolerance: 1 };
    expect(grade(cfg, [], '1,447')).toBe(true);
    expect(grade(cfg, [], '1448')).toBe(false);
    expect(grade(cfg, [], '천사백사십육')).toBe(false);
  });
  it('객관식 복수 정답', () => {
    const cfg: QuestionConfig = { type: 'CHOICE', choices: ['a', 'b', 'c'], answers: [1, 2] };
    expect(grade(cfg, [], 1)).toBe(true);
    expect(grade(cfg, [], 2)).toBe(true);
    expect(grade(cfg, [], 0)).toBe(false);
  });
});

describe('상태 흐름', () => {
  it('허용되지 않은 전환은 거절', () => {
    const s = game([q('MAIN', OX_O)]);
    expect(applyCommand(s, 'REVEAL', {}, 0)).toMatchObject({ ok: false, error: 'INVALID_STATE' });
    ok(s, 'START');
    expect(s.run.phase).toBe('READING');
    expect(applyCommand(s, 'CONFIRM', {}, 0)).toMatchObject({ ok: false });
    expect(allowedCommands(s)).toContain('START_TIMER');
  });

  it('오답·미제출 탈락, 정답 생존', () => {
    const s = game([q('MAIN', OX_O), q('MAIN', OX_O)]);
    ok(s, 'START');
    const r = play(s, { p1: 'O', p2: 'X' }); // p3 미제출
    expect(r.ok).toBe(true);
    expect(aliveIds(s)).toEqual(['p1']);
    expect(s.run.lastResult).toEqual({ eliminatedNow: 2, revivedNow: 0, alive: 1 });
  });

  it('전원 탈락이면 경고, force로 확정', () => {
    const s = game([q('MAIN', OX_O)], 2);
    ok(s, 'START');
    const r = play(s, { p1: 'X', p2: 'X' });
    expect(r).toMatchObject({ ok: false, error: 'ALL_ELIMINATED' });
    expect(s.run.phase).toBe('REVEALED');
    ok(s, 'CONFIRM', { force: true });
    expect(aliveIds(s)).toEqual([]);
  });

  it('되돌리기는 탈락자를 정확히 복구', () => {
    const s = game([q('MAIN', OX_O), q('MAIN', OX_O)]);
    ok(s, 'START');
    play(s, { p1: 'O', p2: 'X', p3: 'X' });
    expect(aliveIds(s)).toEqual(['p1']);
    ok(s, 'UNDO');
    expect(s.run.phase).toBe('REVEALED');
    expect(aliveIds(s).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('정답 수정 → 재채점', () => {
    const s = game([q('MAIN', CHOICE), q('MAIN', OX_O)]);
    ok(s, 'START');
    ok(s, 'START_TIMER', {}, 0);
    submit(s, 'p1', s.run.currentCqId!, 2, 10);
    submit(s, 'p2', s.run.currentCqId!, 3, 10);
    submit(s, 'p3', s.run.currentCqId!, 0, 10);
    ok(s, 'CLOSE', {}, 20);
    ok(s, 'REVEAL', {}, 20 + SUBMIT_GRACE_MS);
    ok(s, 'SET_ANSWER', { answers: [2, 3] }, 1000);
    ok(s, 'CONFIRM', {}, 1100);
    expect(aliveIds(s).sort()).toEqual(['p1', 'p2']);
  });

  it('단답 유사 답안 인정', () => {
    const s = game([q('MAIN', SHORT), q('MAIN', OX_O)], 2);
    ok(s, 'START');
    ok(s, 'START_TIMER', {}, 0);
    submit(s, 'p1', s.run.currentCqId!, '세종대왕', 10);
    submit(s, 'p2', s.run.currentCqId!, '세종 대앙', 10);
    ok(s, 'CLOSE', {}, 20);
    ok(s, 'REVEAL', {}, 20 + SUBMIT_GRACE_MS);
    ok(s, 'ACCEPT_SIMILAR', { normalized: '세종대앙' }, 1000);
    ok(s, 'CONFIRM', {}, 1100);
    expect(aliveIds(s).sort()).toEqual(['p1', 'p2']);
  });

  it('문제 무효 → 예비 문제, 탈락 취소', () => {
    const spare = q('SPARE', OX_O);
    const s = game([q('MAIN', OX_O), q('MAIN', OX_O), spare]);
    ok(s, 'START');
    play(s, { p1: 'O' });
    expect(aliveIds(s)).toEqual(['p1']);
    ok(s, 'VOID', { reason: '정답 오류' });
    expect(aliveIds(s).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(s.run.currentCqId).toBe(spare.id);
    expect(s.run.phase).toBe('READING');
    expect(s.run.index).toBe(1);
  });
});

describe('타이머', () => {
  it('마감 후 유예 0.5초까지만 제출 인정', () => {
    const s = game([q('MAIN', OX_O)]);
    ok(s, 'START');
    ok(s, 'START_TIMER', {}, 0); // endsAt = 10000
    ok(s, 'CLOSE', { auto: true }, 10_000);
    expect(submit(s, 'p1', s.run.currentCqId!, 'O', 10_000 + SUBMIT_GRACE_MS).ok).toBe(true);
    expect(submit(s, 'p2', s.run.currentCqId!, 'O', 10_000 + SUBMIT_GRACE_MS + 1)).toMatchObject({ ok: false, error: 'CLOSED' });
  });

  it('연장, 일시정지·재개', () => {
    const s = game([q('MAIN', OX_O)]);
    ok(s, 'START');
    ok(s, 'START_TIMER', {}, 0);
    ok(s, 'EXTEND', {}, 1000);
    expect(s.run.endsAt).toBe(20_000);
    ok(s, 'PAUSE', {}, 5000);
    expect(s.run.pausedRemainingMs).toBe(15_000);
    expect(submit(s, 'p1', s.run.currentCqId!, 'O', 6000)).toMatchObject({ ok: false, error: 'CLOSED' });
    ok(s, 'RESUME', {}, 100_000);
    expect(s.run.endsAt).toBe(115_000);
  });

  it('서버 재시작 복구는 일시정지로', () => {
    const s = game([q('MAIN', OX_O)]);
    ok(s, 'START');
    ok(s, 'START_TIMER', {}, 0);
    recoverRun(s, 4000);
    expect(s.run.phase).toBe('PAUSED');
    expect(s.run.pausedRemainingMs).toBe(6000);
  });

  it('수정 불허면 두 번째 제출 거절', () => {
    const s = game([q('MAIN', OX_O)], 1, { allowEdit: false });
    ok(s, 'START');
    ok(s, 'START_TIMER', {}, 0);
    expect(submit(s, 'p1', s.run.currentCqId!, 'O', 10).ok).toBe(true);
    expect(submit(s, 'p1', s.run.currentCqId!, 'X', 20)).toMatchObject({ ok: false, error: 'LOCKED' });
  });
});

describe('규칙', () => {
  it('패자부활: 최대 인원이면 빨리 맞힌 순', () => {
    const s = game([q('MAIN', OX_O), q('REVIVAL', OX_O), q('MAIN', OX_O)], 4, { revivalMaxPeople: 1 });
    ok(s, 'START');
    play(s, { p1: 'O' });
    expect(aliveIds(s)).toEqual(['p1']);
    ok(s, 'NEXT');
    expect(s.run.kind).toBe('REVIVAL');
    expect(s.run.targets.sort()).toEqual(['p2', 'p3', 'p4']);
    ok(s, 'START_TIMER', {}, 0);
    expect(submit(s, 'p1', s.run.currentCqId!, 'O', 5)).toMatchObject({ ok: false, error: 'NOT_ALIVE' });
    submit(s, 'p3', s.run.currentCqId!, 'O', 50);
    submit(s, 'p2', s.run.currentCqId!, 'O', 100);
    ok(s, 'CLOSE', {}, 200);
    ok(s, 'REVEAL', {}, 200 + SUBMIT_GRACE_MS);
    ok(s, 'CONFIRM', {}, 2000);
    expect(aliveIds(s).sort()).toEqual(['p1', 'p3']);
    expect(s.run.revivalUsed).toBe(1);
  });

  it('패자부활 문제는 탈락자가 없으면 건너뜀', () => {
    const s = game([q('MAIN', OX_O), q('REVIVAL', OX_O), q('MAIN', OX_O)], 2);
    ok(s, 'START');
    play(s, { p1: 'O', p2: 'O' });
    ok(s, 'NEXT');
    expect(s.run.kind).toBe('NORMAL');
    expect(s.run.index).toBe(2);
  });

  it('생존자 1명 → 골든벨 문제 이동, 틀려도 우승', () => {
    const fin = q('FINAL', SHORT, 40);
    const s = game([q('MAIN', OX_O), q('MAIN', OX_O), fin], 2);
    ok(s, 'START');
    play(s, { p1: 'O', p2: 'X' });
    expect(allowedCommands(s)).toContain('NEXT');
    ok(s, 'NEXT', { jump: 'FINAL' });
    expect(s.run.currentCqId).toBe(fin.id);
    expect(s.run.kind).toBe('FINAL');
    play(s, { p1: '모름' });
    expect(s.run.goldenBell).toBe(false);
    expect(aliveIds(s)).toEqual(['p1']);
    // 틀린 사실을 화면이 그대로 말하도록: 학생은 오답, 결과는 골든벨 실패
    const pv = playerView(s, 'p1');
    expect(pv.me.correct).toBe(false);
    expect(pv.result?.bell).toBe('MISS');
    expect(stageView(s, { connected: new Set<string>(), alerts: [], lastAction: null }).result?.bell).toBe('MISS');
    ok(s, 'NEXT');
    expect(s.run.phase).toBe('FINISHED');
    expect(s.run.finish?.winnerIds).toEqual(['p1']);
    expect(playerView(s, 'p1').finish).toMatchObject({ goldenBell: false, bellMissed: true });
  });

  it('골든벨 문제를 맞히면 골든벨 달성', () => {
    const fin = q('FINAL', SHORT, 40);
    const s = game([q('MAIN', OX_O), fin], 2);
    ok(s, 'START');
    play(s, { p1: 'O', p2: 'X' });
    ok(s, 'NEXT', { jump: 'FINAL' });
    play(s, { p1: '세종대왕' });
    expect(playerView(s, 'p1').result?.bell).toBe('SUCCESS');
    ok(s, 'NEXT');
    expect(playerView(s, 'p1').finish).toMatchObject({ goldenBell: true, bellMissed: false });
  });

  it('문제 소진 시 공동 우승, 순위는 늦게 탈락할수록 높음', () => {
    const s = game([q('MAIN', OX_O), q('MAIN', OX_O)], 4);
    ok(s, 'START');
    play(s, { p1: 'O', p2: 'O', p3: 'O' }); // p4 탈락 (1)
    ok(s, 'NEXT');
    play(s, { p1: 'O', p2: 'O' }); // p3 탈락 (2)
    ok(s, 'NEXT');
    expect(s.run.phase).toBe('FINISHED');
    expect(s.run.finish?.winnerIds.sort()).toEqual(['p1', 'p2']);
    const ranks = computeRanks(s);
    expect([ranks.get('p1'), ranks.get('p2'), ranks.get('p3'), ranks.get('p4')]).toEqual([1, 1, 3, 4]);
  });

  it('시상: 3위 안만, 같은 순위는 묶고 학생 화면에는 학번 없음', () => {
    const s = game([q('MAIN', OX_O), q('MAIN', OX_O)], 5);
    ok(s, 'START');
    play(s, { p1: 'O', p2: 'O', p3: 'O', p4: 'O' }); // p5 탈락 → 5위
    ok(s, 'NEXT');
    play(s, { p1: 'O' }); // p2·p3·p4 함께 탈락 → 공동 2위
    ok(s, 'NEXT');
    expect(s.run.phase).toBe('FINISHED');
    const host = playerView(s, 'p1').finish!;
    expect(host.podium).toEqual([
      { rank: 1, people: [{ name: '학생1', studentNo: '' }] },
      { rank: 2, people: ['학생2', '학생3', '학생4'].map((name) => ({ name, studentNo: '' })) },
    ]);
    const stage = stageView(s, { connected: new Set<string>(), alerts: [], lastAction: null }).finish!;
    expect(stage.podium.flatMap((pl) => pl.people.map((p) => p.studentNo))).toEqual(['', '', '', '']);
  });
});

describe('정답 보호', () => {
  it('공개 전 학생·무대 스냅샷에 정답이 없음', () => {
    const s = game([q('MAIN', { type: 'SHORT', answers: ['비밀정답'] })], 1);
    ok(s, 'START');
    ok(s, 'START_TIMER', {}, 0);
    submit(s, 'p1', s.run.currentCqId!, '비밀정답', 10);
    ok(s, 'CLOSE', {}, 20);
    const info = { connected: new Set<string>(), alerts: [], lastAction: null };
    expect(JSON.stringify(playerView(s, 'p1'))).not.toContain('"correct":true');
    expect(JSON.stringify(stageView(s, info))).not.toContain('비밀정답');
    expect(playerView(s, 'p1').reveal).toBeNull();
    ok(s, 'REVEAL', {}, 20 + SUBMIT_GRACE_MS);
    expect(playerView(s, 'p1').reveal?.answerText).toBe('비밀정답');
    expect(playerView(s, 'p1').me.correct).toBe(true);
  });
});
