import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import QRCode from 'qrcode';
import type { PublicQuestion, RevealStats, StageView } from '@gb/shared/types';
import { emitAck, getSocket } from '../lib/socket.ts';
import { enableSound, sfx } from '../lib/sound.ts';
import { namesOf, podiumLabel, podiumTone } from '../lib/podium.ts';
import { InitialHint, Logo, OXGlyph, RingTimer, RoundChip, optionClass } from '../components/ui.tsx';

const W = 1920;
const H = 1080;

/** 1920×1080 화면을 창 크기에 맞춰 축소·확대 (프로젝터 기준) */
function useFitScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return scale;
}

// SC-15 무대 화면
export default function Stage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const key = params.get('key') ?? '';
  const [view, setView] = useState<StageView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [sound, setSound] = useState(false);
  const scale = useFitScale();

  useEffect(() => {
    const s = getSocket();
    const attach = async () => {
      const r = await emitAck<{ ok: true; state: StageView } | { ok: false; error: string; message?: string }>((cb) =>
        s.emit('stage:attach', { contestId: id, stageKey: key }, cb),
      ).catch(() => null);
      if (!r) return;
      if (r.ok) {
        setError(null);
        setView(r.state);
      } else setError(r.message ?? '무대 화면을 열 수 없어요');
    };
    const onConnect = () => {
      setConnected(true);
      void attach();
    };
    const onDisconnect = () => setConnected(false);
    const onState = (v: unknown) => setView(v as StageView);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('state', onState);
    if (s.connected) void attach();
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('state', onState);
    };
  }, [id, key]);

  useStageSounds(view, sound);

  return (
    <div className="fixed inset-0 overflow-hidden bg-grey-100">
      <div className="absolute top-1/2 left-1/2 origin-center" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {error ? (
          <div className="flex h-full items-center justify-center">
            <p className="display text-6xl text-grey-800">{error}</p>
          </div>
        ) : !view ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-5xl font-bold text-grey-500">무대 화면 연결 중</p>
          </div>
        ) : (
          <StageBody view={view} />
        )}
        {!connected && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 rounded-full bg-red px-8 py-3 text-3xl font-bold text-white">
            연결이 끊겼어요 · 다시 연결하는 중
          </div>
        )}
      </div>

      {!sound && (
        <button
          type="button"
          className="btn btn-primary absolute bottom-5 left-1/2 -translate-x-1/2 shadow-[var(--shadow-pop)]"
          onClick={() => {
            enableSound();
            setSound(true);
            void document.documentElement.requestFullscreen?.().catch(() => {});
          }}
        >
          소리 켜고 전체 화면으로
        </button>
      )}
    </div>
  );
}

/** 상태가 바뀔 때만 효과음 (무대에서만 재생, 직접 합성한 신호음) */
function useStageSounds(view: StageView | null, on: boolean) {
  const prev = useRef<string>('');
  useEffect(() => {
    if (!on || !view) return;
    const key = `${view.phase}:${view.question?.cqId ?? ''}`;
    if (key === prev.current) return;
    const [before] = prev.current.split(':');
    prev.current = key;
    if (view.phase === 'ANSWERING' && before !== 'PAUSED') sfx.start();
    if (view.phase === 'CLOSED') sfx.buzzer();
    if (view.phase === 'REVEALED') sfx.reveal();
    if (view.phase === 'FINISHED') sfx.fanfare();
  }, [view, on]);
}

function StageBody({ view }: { view: StageView }) {
  if (view.phase === 'LOBBY') return <Lobby view={view} />;
  if (view.phase === 'FINISHED') return <Winner view={view} />;
  const q = view.question;
  if (!q) return null;
  if (view.phase === 'REVEALED') return <Reveal view={view} q={q} />;
  if (view.phase === 'CONFIRMED') return <Confirmed view={view} q={q} />;
  return <QuestionScreen view={view} q={q} />;
}

function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`num inline-flex h-[76px] items-center gap-3 rounded-full bg-white px-9 text-[38px] font-bold text-grey-800 ${className}`}>{children}</span>;
}

function Lobby({ view }: { view: StageView }) {
  const joinUrl = `${window.location.origin}/join?code=${view.joinCode}`;
  const [qr, setQr] = useState('');
  useEffect(() => {
    void QRCode.toString(joinUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#191F28', light: '#ffffff' } }).then(setQr);
  }, [joinUrl]);
  return (
    <div className="grid h-full grid-cols-[1fr_auto] items-center gap-20 px-28">
      <div>
        <Logo size={112} />
        <h1 className="display mt-10 text-[136px] leading-[1.02]">덕영 골든벨</h1>
        <p className="mt-5 text-[44px] font-semibold text-grey-700">{view.title}</p>
        <div className="card mt-14 inline-flex items-end gap-12 px-14 py-10">
          <div>
            <p className="text-[32px] font-semibold text-grey-700">참가 코드</p>
            <p className="num display mt-2 text-[150px] leading-none tracking-[0.06em] text-school-deep">{view.joinCode}</p>
          </div>
        </div>
        <p className="mt-8 text-[34px] font-semibold text-grey-700">
          <span className="text-grey-900">{window.location.host}/join</span> 에서 코드·학번·이름을 입력해 주세요
        </p>
      </div>
      <div className="flex flex-col items-center gap-8">
        <div className="card p-10 shadow-[var(--shadow-soft)]">
          <div className="h-[440px] w-[440px]" dangerouslySetInnerHTML={{ __html: qr }} aria-label="참가 QR 코드" />
        </div>
        <Pill>
          <span className="h-4 w-4 rounded-full bg-green" />
          <span>
            <span className="display text-grey-900">{view.joinedCount}</span>명 참가 중
          </span>
        </Pill>
      </div>
    </div>
  );
}

function TopRow({ view, q, center, compact }: { view: StageView; q: PublicQuestion; center?: ReactNode; compact?: boolean }) {
  return (
    <div className={`grid shrink-0 grid-cols-[1fr_auto_1fr] items-center ${compact ? 'h-[130px]' : 'h-[240px]'}`}>
      <div>
        <RoundChip q={q} index={view.index} total={view.total} className="h-[76px] px-9 text-[38px]" />
      </div>
      <div>{center}</div>
      <div className="text-right">
        <Pill>
          <span>
            생존 <span className="display text-grey-900">{view.progress.alive}</span>명
          </span>
        </Pill>
      </div>
    </div>
  );
}

export function QuestionScreen({ view, q }: { view: StageView; q: PublicQuestion }) {
  const onTick = useCallback((sec: number, running: boolean) => {
    if (running && sec <= 5 && sec > 0) sfx.tick();
  }, []);
  const long = q.body.length > 40;
  return (
    <div key={q.cqId} className="relative flex h-full flex-col px-20 pt-8 pb-14">
      <TopRow view={view} q={q} center={<RingTimer phase={view.phase} timer={view.timer} size={224} onTick={onTick} />} />
      {q.kind === 'REVIVAL' && (
        <p className="-mt-2 mb-5 text-center text-[36px] font-bold text-green">탈락자 {view.progress.targets}명이 도전해요 · 맞히면 부활</p>
      )}
      <section className="enter card flex min-h-[250px] flex-col items-center justify-center gap-8 px-16 py-12 text-center">
        <h2 className={`font-extrabold tracking-[-0.03em] ${long ? 'text-[68px] leading-[1.25]' : 'text-[88px] leading-[1.18]'}`}>{q.body}</h2>
        {q.mediaUrl && <img src={q.mediaUrl} alt="" className="max-h-[280px] rounded-[20px] object-contain" />}
        {q.hint && <InitialHint hint={q.hint} size="stage" />}
        {q.unit && <p className="text-[36px] font-semibold text-grey-700">숫자로 답해요 · 단위 {q.unit}</p>}
      </section>
      <div className="mt-8 flex-1">
        <StageChoices q={q} />
      </div>
      <div className="flex h-14 items-center justify-between text-[36px] font-semibold text-grey-700">
        <span>
          {view.phase === 'READING' && (view.timer.readingEndsAt ? '문제를 읽는 중이에요' : '문제를 잘 들어 주세요')}
          {view.phase === 'PAUSED' && '잠시 멈췄어요'}
        </span>
        {view.showSubmitCount && view.phase !== 'READING' && (
          <span className="num">
            제출 <span className="font-extrabold text-grey-900">{view.progress.submitted}</span> / {view.progress.targets}
          </span>
        )}
      </div>
      {view.phase === 'CLOSED' && (
        <Overlay>
          <div className="stamp card px-28 py-14 shadow-[var(--shadow-pop)]">
            <p className="display text-[200px] leading-none text-red">마감!</p>
          </div>
        </Overlay>
      )}
      {view.phase === 'PAUSED' && (
        <Overlay>
          <div className="card px-24 py-12 shadow-[var(--shadow-pop)]">
            <p className="display text-[120px] leading-none">잠시 멈춤</p>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 grid place-items-center bg-grey-100/70 backdrop-blur-[2px]">{children}</div>;
}

function StageChoices({ q }: { q: PublicQuestion }) {
  if (q.type === 'OX') {
    return (
      <div className="grid h-full grid-cols-2 gap-8">
        {(['O', 'X'] as const).map((v) => (
          <div key={v} className={`flex items-center justify-center gap-10 rounded-[36px] ${v === 'O' ? 'opt-2' : 'opt-1'}`}>
            <OXGlyph value={v} size={170} stroke={13} color="#fff" />
            <span className="text-[80px] font-extrabold">{v === 'O' ? '맞아요' : '틀려요'}</span>
          </div>
        ))}
      </div>
    );
  }
  if (q.type === 'CHOICE' && q.choices) {
    const cols = q.choices.length === 3 ? 'grid-cols-3' : 'grid-cols-2';
    return (
      <div className={`grid h-full ${cols} auto-rows-fr gap-6`}>
        {q.choices.map((c) => (
          <div key={c.i} className={`flex items-center gap-8 rounded-[32px] px-10 ${optionClass(c.i)}`}>
            {q.numbered && <span className="key-badge h-[84px] w-[84px] rounded-[22px] text-[48px]">{c.i + 1}</span>}
            <span className="text-[64px] leading-tight font-extrabold">{c.text}</span>
          </div>
        ))}
      </div>
    );
  }
  if (q.type === 'ORDER' && q.items) {
    return (
      <div className="flex h-full items-center justify-center gap-6">
        {q.items.map((it) => (
          <span key={it.id} className="card px-10 py-7 text-[52px] font-bold">
            {it.text}
          </span>
        ))}
      </div>
    );
  }
  return null;
}

/** 정답 공개: 정답만 남고 나머지는 물러나며 선택 인원 막대가 자람 */
function Reveal({ view, q }: { view: StageView; q: PublicQuestion }) {
  const r = view.reveal;
  if (!r) return null;
  const ox = q.type === 'OX' && (r.answerText === 'O' || r.answerText === 'X');
  return (
    <div className="flex h-full flex-col px-20 pt-8 pb-14">
      <TopRow
        view={view}
        q={q}
        compact
        center={<span className="rounded-full bg-green px-10 py-4 text-[40px] font-extrabold text-white">정답 공개</span>}
      />
      <p className="shrink-0 text-center text-[40px] font-bold text-grey-700">{q.body}</p>
      <section className="flip-in card mx-auto mt-6 flex shrink-0 items-center gap-10 px-20 py-10">
        {ox ? (
          <OXGlyph value={r.answerText as 'O' | 'X'} size={150} stroke={14} />
        ) : (
          <span className="grid h-[120px] w-[120px] place-items-center rounded-full bg-green-50">
            <svg width="72" height="72" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="var(--color-green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
        <div>
          <p className={`display leading-none ${r.answerText.length > 12 ? 'text-[88px]' : 'text-[128px]'}`}>
            {ox ? (r.answerText === 'O' ? '맞아요' : '틀려요') : r.answerText}
          </p>
        </div>
      </section>
      {r.explanation && <p className="mx-auto mt-6 max-w-[1500px] shrink-0 text-center text-[38px] leading-snug font-semibold text-grey-700">{r.explanation}</p>}
      <div className="mt-auto">
        <Stats stats={r.stats} />
      </div>
    </div>
  );
}

function Stats({ stats }: { stats: RevealStats }) {
  if (stats.type === 'OX') {
    const total = Math.max(1, stats.o + stats.x + stats.none);
    return (
      <Bars
        rows={[
          { label: 'O 맞아요', n: stats.o, cls: 'opt-2', ratio: stats.o / total },
          { label: 'X 틀려요', n: stats.x, cls: 'opt-1', ratio: stats.x / total },
          { label: '안 냄', n: stats.none, cls: 'bg-grey-400', ratio: stats.none / total },
        ]}
      />
    );
  }
  if (stats.type === 'CHOICE') {
    const total = Math.max(1, ...stats.choices.map((c) => c.count), stats.none);
    return (
      <Bars
        rows={stats.choices.map((c) => ({
          label: `${c.i + 1}. ${c.text}`,
          n: c.count,
          cls: optionClass(c.i),
          ratio: c.count / total,
          dim: !c.correct,
          correct: c.correct,
        }))}
      />
    );
  }
  return (
    <div className="flex items-center justify-center gap-10">
      <div className="card px-14 py-8 text-center">
        <p className="text-[34px] font-semibold text-grey-700">맞힌 사람</p>
        <p className="num display mt-1 text-[96px] leading-none text-green">
          {stats.correct}
          <span className="text-[48px] text-grey-500"> / {stats.total}</span>
        </p>
      </div>
      {stats.type === 'TEXT' && stats.wrongTop.length > 0 && (
        <div className="card px-12 py-8">
          <p className="text-[34px] font-semibold text-grey-700">많이 나온 오답</p>
          <div className="mt-3 flex gap-4">
            {stats.wrongTop.map((w) => (
              <span key={w.answer} className="num rounded-full bg-grey-100 px-7 py-2 text-[40px] font-bold text-grey-800">
                {w.answer} <span className="text-grey-500">{w.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; n: number; cls: string; ratio: number; dim?: boolean; correct?: boolean }[] }) {
  return (
    <div className="card mx-auto flex w-[1500px] flex-col gap-4 px-14 py-8">
      {rows.map((r, i) => (
        <div key={r.label} className="grid grid-cols-[380px_1fr_120px] items-center gap-8">
          <span className={`truncate text-[40px] font-bold ${r.dim ? 'text-grey-600' : 'text-grey-900'}`}>
            {r.label}
            {r.correct && <span className="ml-3 rounded-full bg-green px-4 py-1 align-middle text-[26px] text-white">정답</span>}
          </span>
          <div className="h-12 rounded-[14px] bg-grey-100">
            <div
              className={`grow-x h-full rounded-[14px] ${r.cls}`}
              style={{ width: `${Math.max(2, r.ratio * 100)}%`, animationDelay: `${i * 70}ms`, opacity: r.dim ? 0.45 : 1 }}
            />
          </div>
          <span className={`num text-right text-[52px] font-extrabold ${r.dim ? 'text-grey-700' : 'text-grey-900'}`}>{r.n}</span>
        </div>
      ))}
    </div>
  );
}

function Confirmed({ view, q }: { view: StageView; q: PublicQuestion }) {
  const r = view.result;
  return (
    <div className="flex h-full flex-col px-20 pt-8 pb-14">
      <TopRow view={view} q={q} />
      <div className="flex flex-1 flex-col items-center justify-center gap-12">
        {r?.bell ? (
          <div className="enter card px-24 py-14 text-center">
            <p className={`display text-[120px] leading-none ${r.bell === 'SUCCESS' ? 'text-[#b07d00]' : 'text-red'}`}>{r.bell === 'SUCCESS' ? '골든벨 달성!' : '골든벨 실패'}</p>
            <p className="mt-6 text-[44px] font-bold text-grey-700">{r.bell === 'SUCCESS' ? '마지막 문제까지 모두 맞혔어요' : '아쉽게 틀렸지만 마지막까지 남아 최종 우승이에요'}</p>
          </div>
        ) : r && r.revivedNow > 0 ? (
          <div className="enter card px-24 py-14 text-center">
            <p className="text-[44px] font-bold text-green">패자부활</p>
            <p className="display num mt-2 text-[180px] leading-none">{r.revivedNow}명 부활!</p>
          </div>
        ) : (
          <div className="enter flex gap-8">
            <div className="card w-[560px] px-14 py-12 text-center">
              <p className="text-[44px] font-bold text-grey-700">이번 문제 탈락</p>
              <p className="display num mt-3 text-[200px] leading-none text-red">{r?.eliminatedNow ?? 0}</p>
            </div>
            <div className="card w-[560px] px-14 py-12 text-center">
              <p className="text-[44px] font-bold text-grey-700">생존</p>
              <p className="display num mt-3 text-[200px] leading-none text-school-deep">{r?.alive ?? view.aliveCount}</p>
            </div>
          </div>
        )}
        {view.aliveNames && (
          <div className="flex flex-col items-center gap-6">
            <h3 className="text-[48px] font-bold text-grey-900">살아남은 학생</h3>
            <div className="flex max-w-[1600px] flex-wrap justify-center gap-4">
              {view.aliveNames.map((n, i) => (
                <span key={`${n}-${i}`} className="rounded-full bg-school-50 px-9 py-3 text-[48px] font-bold text-school-deep">
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Winner({ view }: { view: StageView }) {
  const f = view.finish;
  const runnersUp = (f?.podium ?? []).filter((pl) => pl.rank > 1);
  const pieces = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: -((i * 0.53) % 6),
        dur: 5 + ((i * 0.71) % 4),
        bg: ['var(--color-opt1)', 'var(--color-opt2)', 'var(--color-opt3)', 'var(--color-opt4)', 'var(--color-school)'][i % 5],
        rot: (i * 47) % 360,
      })),
    [],
  );
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti"
          style={{ left: `${p.left}%`, background: p.bg, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, rotate: `${p.rot}deg` }}
        />
      ))}
      <div className="card relative flex flex-col items-center gap-8 px-28 py-20 text-center shadow-[var(--shadow-pop)]">
        <Logo size={112} />
        <div className="flex max-w-[1500px] flex-wrap justify-center gap-x-14 gap-y-4">
          {(f?.winners ?? []).map((w, i) => (
            <span key={`${w.name}-${i}`} className="flip-in display text-[140px] leading-tight" style={{ animationDelay: `${i * 120}ms` }}>
              {w.name}
            </span>
          ))}
          {f && f.winners.length === 0 && <span className="display text-[96px]">우승자 없음</span>}
        </div>
        <p className="text-[44px] font-bold text-grey-700">
          <span className={f?.goldenBell ? 'text-[#b07d00]' : 'text-school-deep'}>{f?.goldenBell ? '골든벨 달성!' : '최종 우승'}</span> · {view.title}
        </p>
        {runnersUp.length > 0 && (
          <div className="flex max-w-[1600px] justify-center gap-6">
            {runnersUp.map((pl, i) => (
              <div key={pl.rank} className="flip-in min-w-[440px] max-w-[760px] rounded-[16px] bg-grey-50 px-10 py-6" style={{ animationDelay: `${400 + i * 160}ms` }}>
                <span className={`num inline-block rounded-full px-6 py-1.5 text-[36px] font-extrabold ${podiumTone(pl.rank)}`}>{podiumLabel(pl)}</span>
                <p className="display mt-3 text-[56px] leading-tight">{namesOf(pl.people, 6)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
