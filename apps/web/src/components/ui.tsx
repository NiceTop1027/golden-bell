import { useEffect, useRef, type ReactNode } from 'react';
import { type Phase, type PublicQuestion, ROUND_LABEL, type TimerView, TYPE_LABEL } from '@gb/shared/types';
import { useCountdown } from '../lib/useCountdown.ts';

/** 보기 타일 색: ① 빨강 ② 파랑 ③ 노랑 ④ 초록 ⑤ 보라 (번호와 함께 써서 색만으로 구분하지 않음) */
const OPTION_CLASSES = ['opt-1', 'opt-2', 'opt-3', 'opt-4', 'opt-5'] as const;
export const optionClass = (i: number): string => OPTION_CLASSES[i % OPTION_CLASSES.length]!;

/** 학교 로고: 원본 마크 그대로, 32px 이상 */
export function Logo({ size = 40 }: { size?: number }) {
  const s = Math.max(32, size);
  return (
    <img
      src="/brand/logo-256.png"
      width={s}
      height={s}
      alt="덕영고등학교"
      className="shrink-0 rounded-[24%]"
      style={{ width: s, height: s }}
      draggable={false}
    />
  );
}

/** O는 파란 원, X는 빨간 X: 색과 모양을 함께 */
export function OXGlyph({ value, size = 64, stroke = 12, color }: { value: 'O' | 'X'; size?: number; stroke?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="shrink-0">
      {value === 'O' ? (
        <circle cx="50" cy="50" r={42 - stroke / 2} fill="none" stroke={color ?? 'var(--color-opt2)'} strokeWidth={stroke} />
      ) : (
        <g stroke={color ?? 'var(--color-opt1)'} strokeWidth={stroke} strokeLinecap="round">
          <line x1="18" y1="18" x2="82" y2="82" />
          <line x1="82" y1="18" x2="18" y2="82" />
        </g>
      )}
    </svg>
  );
}

export function roundLabel(q: PublicQuestion, index: number, total: number) {
  if (q.kind === 'REVIVAL') return '패자부활전';
  if (q.kind === 'SUDDEN') return '서든데스';
  if (q.kind === 'FINAL') return '골든벨 문제';
  return `${ROUND_LABEL[q.round]} ${index}/${total}`;
}

export function RoundChip({ q, index, total, className = '' }: { q: PublicQuestion; index: number; total: number; className?: string }) {
  const tone =
    q.kind === 'FINAL' ? 'bg-amber text-grey-900' : q.kind === 'REVIVAL' ? 'bg-green text-white' : '';
  return (
    <span className={`chip num ${tone} ${className}`}>
      {roundLabel(q, index, total)}
      <span className="font-semibold opacity-60">· {TYPE_LABEL[q.type]}</span>
    </span>
  );
}

/** 줄어드는 막대 + 숫자 (학생·진행자) */
export function Timer({
  phase,
  timer,
  onTick,
}: {
  phase: Phase;
  timer: TimerView;
  onTick?: (seconds: number, running: boolean) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const cd = useCountdown(phase, timer, bar);
  useEffect(() => onTick?.(cd.seconds, cd.running), [cd.seconds, cd.running, onTick]);
  const low = cd.running && cd.remainingMs <= 5000;
  return (
    <div className="flex items-center gap-3">
      <div className="timer-track h-2 flex-1">
        <div ref={bar} className="timer-fill" />
      </div>
      <div className={`num w-12 text-right text-2xl leading-none font-extrabold ${low ? 'text-red' : 'text-grey-900'}`}>{cd.seconds}</div>
    </div>
  );
}

/** 무대용 원형 타이머: 링이 줄어들고 마지막 5초 빨강 */
export function RingTimer({
  phase,
  timer,
  size = 260,
  onTick,
}: {
  phase: Phase;
  timer: TimerView;
  size?: number;
  onTick?: (seconds: number, running: boolean) => void;
}) {
  const ring = useRef<SVGCircleElement>(null);
  const stroke = size * 0.09;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cd = useCountdown(phase, timer, undefined, (f) => {
    if (!ring.current) return;
    ring.current.style.strokeDashoffset = String(c * (1 - f.ratio));
    ring.current.style.stroke = f.running && f.remainingMs <= 5000 ? 'var(--color-red)' : 'var(--color-school)';
  });
  useEffect(() => onTick?.(cd.seconds, cd.running), [cd.seconds, cd.running, onTick]);

  const low = cd.running && cd.remainingMs <= 5000;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="var(--color-white)" stroke="var(--color-grey-200)" strokeWidth={stroke} />
        <circle
          ref={ring}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-school)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          style={{ transition: 'stroke 300ms ease' }}
        />
      </svg>
      <span className={`num relative leading-none font-extrabold ${low ? 'text-red' : 'text-grey-900'}`} style={{ fontSize: size * 0.42, letterSpacing: '-0.04em' }}>
        {cd.seconds}
      </span>
    </div>
  );
}

/** 확인창 */
export function ConfirmDialog({
  open,
  title,
  children,
  actions,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="gb-dialog" onClose={onClose} onCancel={onClose}>
      <h2 className="text-[1.375rem] leading-snug font-bold">{title}</h2>
      {children && <div className="mt-2 text-[0.9375rem] leading-relaxed text-grey-700">{children}</div>}
      <div className="mt-6 grid auto-cols-fr grid-flow-col gap-2">{actions}</div>
    </dialog>
  );
}

/** 초성 힌트 칸 */
export function InitialHint({ hint, size = 'md' }: { hint: string; size?: 'md' | 'stage' }) {
  return (
    <div className="flex flex-wrap justify-center gap-2" aria-label={`초성 힌트 ${hint}`}>
      {[...hint].map((ch, i) =>
        ch === ' ' ? (
          <span key={i} className={size === 'stage' ? 'w-8' : 'w-3'} />
        ) : (
          <span
            key={i}
            className={`grid place-items-center font-extrabold text-school-deep ${
              size === 'stage' ? 'h-32 w-32 rounded-[28px] bg-school-50 text-8xl' : 'h-12 w-12 rounded-[12px] bg-school-50 text-2xl'
            }`}
          >
            {ch}
          </span>
        ),
      )}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-[3px] border-current border-r-transparent opacity-80 ${className}`}
      aria-hidden="true"
    />
  );
}

export function ConnDot({ connected }: { connected: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${connected ? 'text-grey-700' : 'text-red'}`}>
      <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green' : 'bg-red'}`} />
      {connected ? '연결됨' : '다시 연결 중'}
    </span>
  );
}

export function CheckMark({ className = '' }: { className?: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-label="선택함" className={`shrink-0 ${className}`}>
      <circle cx="12" cy="12" r="11" fill="#fff" />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="var(--color-grey-900)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
