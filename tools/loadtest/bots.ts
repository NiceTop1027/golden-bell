// 계획서 14.3 부하 테스트 봇. 가짜 학생 N명 + (선택) 자동 진행자
// 사용: pnpm bots -- --n 300 --code 261117 --host admin:goldenbell-admin --contest <id> --accuracy 0.7
import { io, type Socket } from 'socket.io-client';
import type { Answer, ClientToServerEvents, HostView, PlayerView, ServerToClientEvents } from '@gb/shared';

type S = Socket<ServerToClientEvents, ClientToServerEvents>;

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const URL = arg('url', 'http://localhost:4310')!;
const N = Number(arg('n', '30'));
const CODE = arg('code', '261117')!;
// "아이디:비밀번호"면 진행자도 자동. --host-env 이름을 주면 그 환경 변수에서 관리자 비밀번호를 읽음 (명령줄에 비밀번호를 남기지 않음)
const HOST_ENV = arg('host-env');
const HOST = arg('host') ?? (HOST_ENV && process.env[HOST_ENV] ? `admin:${process.env[HOST_ENV]}` : undefined);
const CONTEST = arg('contest');
const ACC = Number(arg('accuracy', '0.75'));
const DISCONNECT = Number(arg('drop', '0')); // 진행 중 끊었다 다시 붙일 인원

const latencies: number[] = [];
let errors = 0;
let hostView: HostView | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const connect = (headers?: Record<string, string>): S =>
  io(`${URL}/game`, { transports: ['websocket'], extraHeaders: headers, reconnection: true, forceNew: true });

/** 진행자 소켓이 아는 정답을 보고 정해진 확률로 맞히는 봇 */
function pickAnswer(q: NonNullable<PlayerView['question']>): Answer {
  const cfg = hostView?.question?.config;
  const right = Math.random() < ACC;
  switch (q.type) {
    case 'OX':
      if (cfg?.type === 'OX') return right ? cfg.answer : cfg.answer === 'O' ? 'X' : 'O';
      return Math.random() < 0.5 ? 'O' : 'X';
    case 'CHOICE': {
      const choices = q.choices ?? [];
      if (cfg?.type === 'CHOICE' && right) return cfg.answers[0]!;
      const wrong = choices.filter((c) => !(cfg?.type === 'CHOICE' && cfg.answers.includes(c.i)));
      return (wrong[Math.floor(Math.random() * wrong.length)] ?? choices[0]!).i;
    }
    case 'ORDER': {
      const ids = cfg?.type === 'ORDER' ? cfg.items.map((i) => i.id) : (q.items ?? []).map((i) => i.id);
      return right ? ids : [...ids].reverse();
    }
    case 'NUMBER':
      if (cfg?.type === 'NUMBER' && right) return cfg.answer.toLocaleString('ko-KR');
      return String(Math.floor(Math.random() * 2000));
    default:
      if ((cfg?.type === 'SHORT' || cfg?.type === 'INITIAL') && right) {
        const a = cfg.answers[0]!;
        return Math.random() < 0.15 ? ` ${a.split('').join(' ')}! ` : a; // 정규화 확인용 변형
      }
      return ['모름', '세종대앙', '서울시', '고구려'][Math.floor(Math.random() * 4)]!;
  }
}

async function makePlayer(i: number) {
  const studentNo = String(30000 + i);
  // 합성 이름 (실제 학생 아님)
  const FAMILY = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오'];
  const GIVEN = ['민준', '서연', '도윤', '하은', '시우', '지아', '주원', '서윤', '예준', '하린', '지호', '수아', '건우', '채원', '우진', '지유'];
  const name = `${FAMILY[i % FAMILY.length]}${GIVEN[(i * 7) % GIVEN.length]}`;
  let token: string | undefined;
  let state: PlayerView | null = null;
  let pendingCq: string | null = null;
  const s = connect();

  const join = () =>
    new Promise<void>((resolve) => {
      s.emit('player:join', { code: CODE, studentNo, name, token }, (r) => {
        if (r.ok) {
          token = r.token;
          state = r.state;
        } else {
          errors += 1;
          console.error(`[join ${studentNo}]`, r.error);
        }
        resolve();
      });
    });

  s.on('connect', () => void join());
  s.on('state', (v) => {
    state = v as PlayerView;
    const st = state;
    if (st.phase === 'ANSWERING' && st.question && st.me.eligible && !st.me.submitted && pendingCq !== st.question.cqId) {
      pendingCq = st.question.cqId;
      const q = st.question;
      const window = Math.max(300, Math.min(3000, (st.timer.durationMs || 10_000) * 0.4));
      setTimeout(() => {
        const t0 = performance.now();
        const answer = pickAnswer(q);
        const send = (retry: boolean) => s.emit('player:submit', { cqId: q.cqId, answer }, (r) => {
          if (!r.ok && r.error === 'NOT_JOINED' && retry) return void join().then(() => send(false));
          latencies.push(performance.now() - t0);
          if (!r.ok && r.error !== 'CLOSED') {
            errors += 1;
            console.error(`[submit ${studentNo}]`, r.error);
          }
        });
        send(true);
      }, 200 + Math.random() * window);
    }
  });
  await new Promise<void>((r) => s.once('connect', () => r()));
  return { s, get state() { return state; }, reconnect: () => { s.disconnect(); setTimeout(() => s.connect(), 500); } };
}

async function login(): Promise<string> {
  const [loginId, password] = HOST!.split(':');
  const res = await fetch(`${URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loginId, password }),
  });
  if (!res.ok) throw new Error(`로그인 실패 ${res.status}`);
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

async function main() {
  const t0 = performance.now();
  const players = [];
  for (let i = 1; i <= N; i++) players.push(makePlayer(i));
  const ps = await Promise.all(players);
  await sleep(500);
  console.log(`참가 ${N}명 연결 ${Math.round(performance.now() - t0)}ms, 오류 ${errors}`);

  if (!HOST || !CONTEST) {
    console.log('진행자 자동 진행 없음 (--host, --contest 필요). 접속 유지 중… Ctrl+C로 종료');
    return;
  }

  const cookie = await login();
  const host = connect({ cookie });
  let seq = 0;
  const cmd = (type: string, args: Record<string, unknown> = {}) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) =>
      host.emit('host:command', { commandId: `bot-${Date.now()}-${seq++}`, type: type as never, args }, (r) => resolve(r)),
    );

  await new Promise<void>((resolve, reject) =>
    host.emit('host:attach', { contestId: CONTEST }, (r) => {
      if (!r.ok) return reject(new Error(r.error));
      hostView = r.state;
      resolve();
    }),
  );
  host.on('state', (v) => (hostView = v as HostView));

  let dropped = false;
  let lastKey = '';
  const log: string[] = [];
  for (;;) {
    await sleep(150);
    const h = hostView!;
    const key = `${h.phase}:${h.question?.cqId ?? ''}`;
    if (key === lastKey && h.phase !== 'ANSWERING') continue;
    lastKey = key;
    switch (h.phase) {
      case 'LOBBY':
        if (h.joinedCount >= N) await cmd('START');
        else lastKey = '';
        break;
      case 'READING':
        await sleep(300);
        await cmd('START_TIMER');
        break;
      case 'ANSWERING':
        if (!dropped && DISCONNECT > 0) {
          dropped = true;
          ps.slice(0, DISCONNECT).forEach((p) => p.reconnect());
          console.log(`재접속 시험: ${DISCONNECT}명 끊었다가 다시 연결`);
        }
        if (h.progress.submitted >= h.progress.targets) await cmd('CLOSE');
        break;
      case 'CLOSED':
        await cmd('REVEAL');
        break;
      case 'REVEALED': {
        const r = await cmd('CONFIRM');
        if (!r.ok && r.error === 'ALL_ELIMINATED') await cmd('CONFIRM', { force: true });
        break;
      }
      case 'CONFIRMED':
        log.push(`${h.question?.round ?? ''} ${h.index}/${h.total} ${h.question?.type ?? ''} → 탈락 ${h.result?.eliminatedNow ?? 0}, 부활 ${h.result?.revivedNow ?? 0}, 생존 ${h.aliveCount}`);
        await sleep(200);
        await cmd('NEXT', h.canJumpToFinal ? { jump: 'FINAL' } : {});
        break;
      case 'FINISHED': {
        console.log(log.join('\n'));
        const sorted = [...latencies].sort((a, b) => a - b);
        const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
        const winners = h.finish?.winners.map((w) => w.name).join(', ');
        console.log(`우승: ${winners} ${h.finish?.goldenBell ? '(골든벨 달성)' : ''}`);
        console.log(`제출 ${latencies.length}건, 응답 p95 ${p95.toFixed(1)}ms, 최대 ${(sorted.at(-1) ?? 0).toFixed(1)}ms, 오류 ${errors}`);
        const mismatch = ps.filter((p) => p.state && p.state.phase !== 'FINISHED').length;
        console.log(`최종 상태 불일치 기기: ${mismatch}`);
        process.exit(errors > 0 || mismatch > 0 ? 1 : 0);
      }
    }
  }
}

void main();
