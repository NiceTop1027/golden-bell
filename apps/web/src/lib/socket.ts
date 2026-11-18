import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@gb/shared/types';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

/** 페이지 사이에서 공유하는 소켓 1개. 학교망에서 WebSocket이 막히면 롱폴링으로 동작 */
export function getSocket(): GameSocket {
  if (!socket) {
    socket = io('/game', { withCredentials: true, reconnectionDelay: 500, reconnectionDelayMax: 3000 });
    void import('./timeSync.ts').then((m) => m.startTimeSync(socket!));
  }
  return socket;
}

/** 응답이 없으면 실패로 처리하는 emit */
export function emitAck<T>(fn: (cb: (r: T) => void) => void, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
    fn((r) => {
      clearTimeout(t);
      resolve(r);
    });
  });
}

export const newCommandId = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 32);
