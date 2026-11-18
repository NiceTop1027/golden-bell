// 계획서 5.9 시간 동기화: 5번 재서 왕복이 가장 짧은 응답으로 offset 계산, 30초마다 다시
import type { GameSocket } from './socket.ts';

let offset = 0;
let synced = false;
const listeners = new Set<() => void>();

export const serverNow = () => Date.now() + offset;
export const isSynced = () => synced;
export function onSync(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function ping(s: GameSocket): Promise<{ rtt: number; offset: number } | null> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const timer = setTimeout(() => resolve(null), 3000);
    s.emit('time:ping', { t0 }, ({ serverNow: srv }) => {
      clearTimeout(timer);
      const t1 = Date.now();
      resolve({ rtt: t1 - t0, offset: srv - (t0 + t1) / 2 });
    });
  });
}

async function measure(s: GameSocket) {
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const r = await ping(s);
    if (r) samples.push(r);
  }
  if (samples.length === 0) return;
  samples.sort((a, b) => a.rtt - b.rtt);
  offset = samples[0]!.offset;
  synced = true;
  listeners.forEach((l) => l());
}

export function startTimeSync(s: GameSocket) {
  s.on('connect', () => void measure(s));
  if (s.connected) void measure(s);
  setInterval(() => s.connected && void measure(s), 30_000);
}
