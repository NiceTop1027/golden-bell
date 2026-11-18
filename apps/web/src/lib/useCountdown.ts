import { useEffect, useRef, useState } from 'react';
import type { Phase, TimerView } from '@gb/shared/types';
import { onSync, serverNow } from './timeSync.ts';

export type Countdown = {
  /** 화면 숫자: 초 단위 올림 */
  seconds: number;
  remainingMs: number;
  /** 막대 비율 0–1 */
  ratio: number;
  running: boolean;
};

function compute(phase: Phase, t: TimerView): Countdown {
  if (phase === 'PAUSED' && t.remainingMs !== null) {
    const ms = t.remainingMs;
    return { seconds: Math.ceil(ms / 1000), remainingMs: ms, ratio: t.durationMs ? ms / t.durationMs : 0, running: false };
  }
  if (phase === 'ANSWERING' && t.endsAt !== null) {
    const ms = Math.max(0, t.endsAt - serverNow());
    return { seconds: Math.ceil(ms / 1000), remainingMs: ms, ratio: t.durationMs ? Math.min(1, ms / t.durationMs) : 0, running: ms > 0 };
  }
  if (phase === 'READING') {
    return { seconds: Math.round(t.durationMs / 1000), remainingMs: t.durationMs, ratio: 1, running: false };
  }
  return { seconds: 0, remainingMs: 0, ratio: 0, running: false };
}

/**
 * 서버 마감 시각(endsAt) 기준 카운트다운. 숫자는 초가 바뀔 때만 다시 그리고,
 * 막대는 barRef에 requestAnimationFrame으로 직접 transform을 씀
 */
export function useCountdown(
  phase: Phase,
  timer: TimerView,
  barRef?: React.RefObject<HTMLElement | null>,
  onFrame?: (c: Countdown) => void,
) {
  const frame = useRef(onFrame);
  frame.current = onFrame;
  const [cd, setCd] = useState(() => compute(phase, timer));
  const last = useRef(cd.seconds);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const c = compute(phase, timer);
      if (barRef?.current) {
        barRef.current.style.transform = `scaleX(${c.ratio})`;
        barRef.current.dataset.level = c.running && c.remainingMs <= 5000 ? 'low' : 'ok';
      }
      frame.current?.(c);
      if (c.seconds !== last.current || c.running !== cd.running) {
        last.current = c.seconds;
        setCd(c);
      }
      if (c.running) raf = requestAnimationFrame(tick);
    };
    const c = compute(phase, timer);
    last.current = c.seconds;
    setCd(c);
    tick();
    // 탭 전환·화면 꺼짐에서 돌아오면 endsAt 기준으로 즉시 다시 계산
    const vis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', vis);
    const off = onSync(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', vis);
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timer.endsAt, timer.remainingMs, timer.durationMs, timer.paused]);

  return cd;
}
