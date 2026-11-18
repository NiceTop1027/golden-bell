// 무대 화면 효과음: 직접 합성한 신호음 (외부 음원·방송 효과음 사용 안 함, 계획서 5.9)
let ctx: AudioContext | null = null;

export function enableSound() {
  ctx ??= new AudioContext();
  void ctx.resume();
  return ctx.state !== 'closed';
}
export const soundEnabled = () => ctx !== null && ctx.state === 'running';

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.25) {
  if (!ctx) return;
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  start: () => {
    tone(660, 0, 0.12, 'triangle');
    tone(990, 0.12, 0.2, 'triangle');
  },
  tick: () => tone(1200, 0, 0.06, 'square', 0.12),
  buzzer: () => {
    tone(140, 0, 0.6, 'sawtooth', 0.22);
    tone(147, 0, 0.6, 'sawtooth', 0.18);
  },
  reveal: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.35, 'triangle', 0.2)),
  fanfare: () =>
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.14, i === 6 ? 1.2 : 0.3, 'triangle', 0.22)),
};
