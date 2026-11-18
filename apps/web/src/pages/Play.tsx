import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useParams } from 'react-router';
import type { Answer, JoinAck, PlayerView, PublicQuestion, SubmitAck } from '@gb/shared/types';
import { emitAck, getSocket } from '../lib/socket.ts';
import { loadSession, saveSession } from '../lib/session.ts';
import { namesOf, podiumLabel, podiumTone } from '../lib/podium.ts';
import { CheckMark, ConnDot, InitialHint, Logo, OXGlyph, RoundChip, Spinner, Timer, optionClass } from '../components/ui.tsx';

const SUBMIT_ERRORS: Record<string, string> = {
  CLOSED: '마감됐어요',
  LOCKED: '이 대회는 낸 답을 바꿀 수 없어요',
  NOT_ALIVE: '이번 문제는 답을 낼 수 없어요',
  INVALID: '답 형식을 확인해 주세요',
  NOT_JOINED: '다시 연결하는 중이에요. 잠시 후 다시 눌러 주세요',
};

const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

// SC-17 학생 화면
export default function Play() {
  const { id = '' } = useParams();
  const session = loadSession(id);
  const [view, setView] = useState<PlayerView | null>(null);
  const [connected, setConnected] = useState(true);
  const [kicked, setKicked] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [sending, setSending] = useState<{ cqId: string; answer: Answer } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const joinRef = useRef<() => Promise<boolean>>(async () => false);

  useEffect(() => {
    if (!session) return;
    const s = getSocket();
    let current = session;
    const join = async () => {
      const r = await emitAck<JoinAck>((cb) =>
        s.emit('player:join', { code: current.code, studentNo: current.studentNo, name: current.name, token: current.token }, cb),
      ).catch(() => null);
      if (!r) return false;
      if (r.ok) {
        setFatal(null);
        setView(r.state);
        if (r.token !== current.token) {
          current = { ...current, token: r.token };
          saveSession(current);
        }
        return true;
      }
      if (r.error === 'DEVICE_CHANGE_PENDING') setKicked('이 학번은 다른 기기에서 참가 중이에요.');
      else setFatal(r.message ?? '대회에 다시 들어가지 못했어요.');
      return false;
    };
    joinRef.current = join;
    const onConnect = () => {
      setConnected(true);
      void join();
    };
    const onDisconnect = () => setConnected(false);
    const onState = (v: unknown) => setView(v as PlayerView);
    const onKicked = (p: { reason: string }) => setKicked(p.reason);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('state', onState);
    s.on('kicked', onKicked);
    const onVis = () => s.emit('player:visibility', { hidden: document.visibilityState === 'hidden' });
    document.addEventListener('visibilitychange', onVis);
    setConnected(s.connected);
    if (s.connected) void join();
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('state', onState);
      s.off('kicked', onKicked);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const submit = useCallback(async (cqId: string, answer: Answer) => {
    const s = getSocket();
    setSending({ cqId, answer });
    const send = () => emitAck<SubmitAck>((cb) => s.emit('player:submit', { cqId, answer }, cb), 6000);
    try {
      let r = await send();
      if (!r.ok && r.error === 'NOT_JOINED' && (await joinRef.current())) r = await send();
      if (!r.ok) setToast(SUBMIT_ERRORS[r.error] ?? '제출하지 못했어요');
    } catch {
      setToast('답이 전달되지 않았어요. 다시 눌러 주세요');
    } finally {
      setSending(null);
    }
  }, []);

  if (!session) return <Navigate to="/join" replace />;

  if (kicked) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">이 기기는 연결이 끊겼어요</h1>
        <p className="mt-2 text-grey-700">{kicked}</p>
        <a href="/join" className="btn btn-primary btn-lg mt-8 w-full">
          참가 화면으로
        </a>
      </Centered>
    );
  }
  if (fatal) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">대회에 들어가지 못했어요</h1>
        <p className="mt-2 text-grey-700">{fatal}</p>
        <a href="/join" className="btn btn-primary btn-lg mt-8 w-full">
          다시 참가하기
        </a>
      </Centered>
    );
  }
  if (!view) {
    return (
      <Centered>
        <Spinner className="h-8 w-8 text-school" />
        <p className="mt-4 font-semibold text-grey-700">대회에 연결하는 중이에요</p>
      </Centered>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <TopBar view={view} connected={connected} />
      <main className="flex flex-1 flex-col px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <Body view={view} sending={sending} onSubmit={submit} />
      </main>
      {toast && (
        <div role="alert" className="enter fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 mx-auto max-w-md">
          <div className="rounded-[16px] bg-grey-900/90 px-4 py-3.5 text-center font-semibold text-white backdrop-blur">{toast}</div>
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 text-center">{children}</main>;
}

function TopBar({ view, connected }: { view: PlayerView; connected: boolean }) {
  const q = view.question;
  const showTimer = q && (view.phase === 'ANSWERING' || view.phase === 'READING' || (view.phase === 'PAUSED' && view.timer.remainingMs !== null));
  return (
    <header className="sticky top-0 z-10 bg-grey-100/90 px-4 pt-[max(0.875rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
      <div className="flex h-9 items-center justify-between gap-2">
        {q ? <RoundChip q={q} index={view.index} total={view.total} /> : <span className="truncate font-bold text-grey-800">{view.title}</span>}
        {!connected ? (
          <ConnDot connected={false} />
        ) : view.phase !== 'LOBBY' ? (
          <span className="num shrink-0 text-[0.9375rem] font-semibold text-grey-700">생존 {view.aliveCount}명</span>
        ) : null}
      </div>
      {showTimer && (
        <div className="mt-3">
          <PlayerTimer view={view} />
        </div>
      )}
    </header>
  );
}

function PlayerTimer({ view }: { view: PlayerView }) {
  const vibrated = useRef(-1);
  const onTick = useCallback(
    (sec: number, running: boolean) => {
      // 마지막 5초 진동 (안드로이드만, iOS 사파리는 미지원)
      if (isAndroid && running && sec <= 5 && sec > 0 && view.me.eligible && !view.me.submitted && vibrated.current !== sec) {
        vibrated.current = sec;
        navigator.vibrate?.(40);
      }
    },
    [view.me.eligible, view.me.submitted],
  );
  return <Timer phase={view.phase} timer={view.timer} onTick={onTick} />;
}

function Body({
  view,
  sending,
  onSubmit,
}: {
  view: PlayerView;
  sending: { cqId: string; answer: Answer } | null;
  onSubmit: (cqId: string, a: Answer) => void;
}) {
  const { phase, me, question: q } = view;

  if (phase === 'LOBBY') {
    return (
      <div className="enter flex flex-1 flex-col items-center justify-center pb-10 text-center">
        <Logo size={64} />
        <h1 className="display mt-6 text-[2rem] leading-tight">
          {me.name}님,
          <br />곧 시작해요
        </h1>
        <p className="num chip mt-6 text-[0.9375rem]">
          <span className="h-2 w-2 rounded-full bg-green" />
          지금 {view.joinedCount}명 참가 중
        </p>
        <p className="mt-10 max-w-[17rem] text-sm leading-relaxed text-grey-700">화면을 켜 둔 채로 기다려 주세요. 꺼져도 다시 켜면 이어져요.</p>
      </div>
    );
  }

  if (phase === 'FINISHED') return <Finished view={view} />;
  if (phase === 'PAUSED' && !q) return <Notice title="잠시 멈췄어요" text="진행자가 곧 다시 시작해요." />;
  if (!q) return <Notice title="다음 문제를 기다리는 중" text="" />;

  const revivalWait = q.kind === 'REVIVAL' && !me.eligible && me.status === 'ALIVE';
  if (revivalWait && phase !== 'CONFIRMED') {
    return <Notice title="패자부활전 진행 중" text="탈락한 친구들이 부활에 도전하고 있어요. 생존자는 잠시 기다려 주세요." />;
  }

  return (
    <div key={q.cqId} className="enter flex flex-1 flex-col gap-3 pt-2">
      {phase === 'PAUSED' && <Banner tone="amber">잠시 멈췄어요 · 타이머가 멈춰 있어요</Banner>}
      {q.kind === 'REVIVAL' && me.eligible && phase !== 'CONFIRMED' && <Banner tone="green">패자부활전! 맞히면 다시 살아나요</Banner>}
      <QuestionCard q={q} />
      <Result view={view} />
      <AnswerArea view={view} q={q} sending={sending} onSubmit={onSubmit} />
      <StatusLine view={view} q={q} />
    </div>
  );
}

function Banner({ tone, children }: { tone: 'amber' | 'green'; children: ReactNode }) {
  return (
    <p className={`rounded-[14px] px-4 py-3 text-center text-[0.9375rem] font-bold ${tone === 'amber' ? 'bg-amber-50 text-grey-900' : 'bg-green-50 text-green'}`}>
      {children}
    </p>
  );
}

function QuestionCard({ q }: { q: PublicQuestion }) {
  return (
    <section className="card flex flex-col gap-4 px-5 py-6">
      <p className="text-[1.25rem] leading-[1.45] font-bold">{q.body}</p>
      {q.mediaUrl && <img src={q.mediaUrl} alt="" className="max-h-56 w-full rounded-[14px] object-contain" />}
      {q.hint && <InitialHint hint={q.hint} />}
      {q.length && <p className="text-sm font-semibold text-grey-700">{q.length}글자</p>}
    </section>
  );
}

/** 공개 후 정답/오답, 확정 후 생존/탈락 (탈락 문구는 확정 뒤에만) */
function Result({ view }: { view: PlayerView }) {
  const { phase, me, reveal, result } = view;
  const confirmed = phase === 'CONFIRMED';
  if (!reveal || !(phase === 'REVEALED' || confirmed)) return null;
  if (view.question?.kind === 'REVIVAL' && !me.eligible) return null;

  // 골든벨 문제는 틀려도 탈락하지 않음: '생존'이 아니라 맞혔는지를 그대로 말함
  if (confirmed && me.eligible && result?.bell) {
    const hit = result.bell === 'SUCCESS';
    return (
      <section className="flip-in card px-5 py-6 text-center">
        <p className={`display text-[1.75rem] ${hit ? 'text-green' : 'text-red'}`}>{hit ? '골든벨을 울렸어요!' : '골든벨 문제를 틀렸어요'}</p>
        <p className="mt-1.5 font-semibold text-grey-800">정답: {reveal.answerText}</p>
        {!hit && <p className="mt-3 rounded-[12px] bg-grey-100 px-3 py-2 text-sm font-semibold text-grey-700">마지막까지 남은 한 명이라 최종 우승은 지켜요</p>}
      </section>
    );
  }

  if (confirmed && me.eligible) {
    const revived = view.question?.kind === 'REVIVAL' && me.status === 'ALIVE';
    const out = me.status === 'ELIMINATED';
    return (
      <section className="flip-in card px-5 py-6 text-center">
        <p className={`display text-[1.75rem] ${out ? 'text-red' : 'text-green'}`}>
          {revived ? '부활했어요!' : out ? '아쉽게 탈락했어요' : '생존했어요!'}
        </p>
        <p className="mt-1.5 font-semibold text-grey-700">
          {out ? (me.eliminatedAtIndex ? `${me.eliminatedAtIndex}번 문제에서 탈락 · 이제 관전해요` : '이제 관전해요') : '다음 문제를 기다려 주세요'}
        </p>
        {result && (
          <p className="num mt-4 rounded-[12px] bg-grey-100 px-3 py-2 text-sm font-semibold text-grey-700">
            이번 문제 탈락 {result.eliminatedNow}명 · 생존 {result.alive}명
          </p>
        )}
      </section>
    );
  }

  if (!me.eligible) {
    return (
      <section className="flip-in card px-5 py-5 text-center">
        <p className="display text-2xl">정답은 {reveal.answerText}</p>
      </section>
    );
  }

  return (
    <section className="flip-in card px-5 py-6 text-center">
      <div className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${me.correct ? 'bg-green-50' : 'bg-red-50'}`}>
        {me.correct ? (
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="var(--color-green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="var(--color-red)" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <p className={`display mt-3 text-[1.75rem] ${me.correct ? 'text-green' : 'text-red'}`}>{me.correct ? '정답이에요!' : '아쉬워요, 오답이에요'}</p>
      <p className="mt-1.5 font-semibold text-grey-800">정답: {reveal.answerText}</p>
      {reveal.explanation && <p className="mt-2 text-sm leading-relaxed text-grey-700">{reveal.explanation}</p>}
    </section>
  );
}

function AnswerArea({
  view,
  q,
  sending,
  onSubmit,
}: {
  view: PlayerView;
  q: PublicQuestion;
  sending: { cqId: string; answer: Answer } | null;
  onSubmit: (cqId: string, a: Answer) => void;
}) {
  const { phase, me } = view;
  if (!me.eligible && q.kind === 'REVIVAL') return null;
  const open = phase === 'ANSWERING' && me.eligible;
  const shown: Answer | null = sending?.cqId === q.cqId ? sending.answer : me.answer;
  const reveal = view.reveal;
  const choose = (a: Answer) => open && !sending && onSubmit(q.cqId, a);

  if (q.type === 'OX') {
    return (
      <div className={`grid grid-cols-2 gap-2.5 ${shown !== null ? 'keys-chosen' : ''}`}>
        {(['O', 'X'] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={`key aspect-[1/1.05] flex-col justify-center gap-3 ${v === 'O' ? 'opt-2' : 'opt-1'}`}
            aria-pressed={shown === v}
            disabled={!open}
            onClick={() => choose(v)}
            aria-label={v === 'O' ? 'O 맞아요' : 'X 틀려요'}
          >
            <OXGlyph value={v} size={84} stroke={13} color="#fff" />
            <span className="text-xl font-bold">{v === 'O' ? '맞아요' : '틀려요'}</span>
            {shown === v && <CheckMark className="absolute top-3 right-3" />}
          </button>
        ))}
      </div>
    );
  }

  if (q.type === 'CHOICE') {
    return (
      <div className={`flex flex-col gap-2.5 ${shown !== null && !reveal ? 'keys-chosen' : ''}`}>
        {(q.choices ?? []).map((c, pos) => {
          const stat = reveal?.stats.type === 'CHOICE' ? reveal.stats.choices.find((s) => s.i === c.i) : undefined;
          return (
            <button
              key={c.i}
              type="button"
              className={`key ${optionClass(c.i)} ${stat && !stat.correct ? 'opacity-35' : ''}`}
              aria-pressed={shown === c.i}
              disabled={!open}
              onClick={() => choose(c.i)}
            >
              <span className="key-badge">{q.numbered ? c.i + 1 : pos + 1}</span>
              <span className="flex-1 text-[1.125rem]">{c.text}</span>
              {stat?.correct && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-grey-900">정답</span>}
              {shown === c.i && !stat && <CheckMark />}
            </button>
          );
        })}
      </div>
    );
  }

  if (q.type === 'ORDER') return <OrderInput q={q} open={open} shown={shown} onSubmit={(a) => choose(a)} />;

  return <TextInput key={q.cqId} q={q} open={open} shown={shown} busy={sending !== null} onSubmit={(a) => choose(a)} />;
}

function TextInput({
  q,
  open,
  shown,
  busy,
  onSubmit,
}: {
  q: PublicQuestion;
  open: boolean;
  shown: Answer | null;
  busy: boolean;
  onSubmit: (a: Answer) => void;
}) {
  const [value, setValue] = useState(typeof shown === 'string' ? shown : '');
  const numeric = q.type === 'NUMBER';
  const submitted = typeof shown === 'string' || typeof shown === 'number';
  const changed = String(shown ?? '') !== value.trim();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    onSubmit(value.trim());
  };
  return (
    <form onSubmit={submit} className="card flex flex-col gap-3 p-4">
      <div className="relative">
        <input
          className={`field text-[1.25rem] ${q.unit ? 'pr-14' : ''}`}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 30))}
          inputMode={numeric ? 'decimal' : 'text'}
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={numeric ? '숫자로 입력해 주세요' : '답을 입력해 주세요'}
          disabled={!open}
          maxLength={30}
          aria-label="답"
        />
        {q.unit && <span className="absolute top-1/2 right-4 -translate-y-1/2 text-lg font-bold text-grey-700">{q.unit}</span>}
      </div>
      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={!open || busy || !value.trim() || (submitted && !changed)}>
        {busy ? <Spinner /> : submitted ? (changed ? '이 답으로 바꾸기' : '제출했어요') : '제출하기'}
      </button>
    </form>
  );
}

/** 순서 맞추기: 차례로 탭해 번호 매기기 */
function OrderInput({ q, open, shown, onSubmit }: { q: PublicQuestion; open: boolean; shown: Answer | null; onSubmit: (a: Answer) => void }) {
  const [picked, setPicked] = useState<string[]>(Array.isArray(shown) ? shown : []);
  const items = q.items ?? [];
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it) => {
        const n = picked.indexOf(it.id);
        return (
          <button
            key={it.id}
            type="button"
            className={`key ${n >= 0 ? 'opt-2' : 'bg-white !text-grey-900'}`}
            disabled={!open}
            onClick={() => toggle(it.id)}
          >
            <span className={`key-badge ${n >= 0 ? '' : '!bg-grey-100'}`}>{n >= 0 ? n + 1 : ''}</span>
            <span className="flex-1 text-[1.125rem]">{it.text}</span>
          </button>
        );
      })}
      <div className="mt-1 grid grid-cols-[1fr_2fr] gap-2">
        <button type="button" className="btn btn-on-white bg-white" disabled={!open || picked.length === 0} onClick={() => setPicked([])}>
          다시 고르기
        </button>
        <button type="button" className="btn btn-primary" disabled={!open || picked.length !== items.length} onClick={() => onSubmit(picked)}>
          제출하기
        </button>
      </div>
    </div>
  );
}

function StatusLine({ view, q }: { view: PlayerView; q: PublicQuestion }) {
  const { phase, me } = view;
  let text: string | null = null;
  if (!me.eligible && me.status === 'ELIMINATED') text = '관전 중이에요 · 문제와 정답은 계속 볼 수 있어요';
  else if (phase === 'READING') text = view.timer.readingEndsAt ? '문제를 읽는 중이에요. 곧 답할 수 있어요' : '사회자가 문제를 읽고 있어요';
  else if (phase === 'ANSWERING') text = me.submitted ? '제출했어요 · 마감 전까지 바꿀 수 있어요' : null;
  else if (phase === 'CLOSED') text = me.submitted ? '마감됐어요 · 정답 공개를 기다려요' : '마감됐어요 · 답을 내지 않았어요';
  if (!text) return null;
  const done = phase === 'ANSWERING' && me.submitted;
  return (
    <p className={`num mt-auto rounded-[14px] px-4 py-3.5 text-center text-[0.9375rem] font-semibold ${done ? 'bg-grey-900 text-white' : 'bg-grey-200 text-grey-800'}`}>
      {text}
      {phase === 'CLOSED' && me.answer !== null && q.type !== 'CHOICE' && q.type !== 'OX' && ` · 내 답: ${String(me.answer)}`}
    </p>
  );
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="enter flex flex-1 flex-col items-center justify-center pb-10 text-center">
      <h1 className="display text-[1.75rem]">{title}</h1>
      {text && <p className="mt-2 max-w-xs leading-relaxed text-grey-700">{text}</p>}
    </div>
  );
}

function Finished({ view }: { view: PlayerView }) {
  const { me, finish } = view;
  const won = me.rank === 1;
  return (
    <div className="enter flex flex-1 flex-col items-center justify-center pb-10 text-center">
      {won ? (
        <>
          <p className="chip bg-amber text-grey-900">{finish?.goldenBell ? '골든벨 달성!' : '최종 우승'}</p>
          <h1 className="display mt-4 text-[2.5rem] leading-tight">
            {me.name}님
            <br />
            우승했어요!
          </h1>
          {finish?.bellMissed && <p className="mt-2 font-semibold text-grey-700">골든벨 문제는 아쉽게 틀렸어요</p>}
        </>
      ) : (
        <>
          <p className="chip">대회 끝</p>
          <h1 className="display num mt-4 text-[2.5rem]">최종 {me.rank ?? '-'}위</h1>
          {me.eliminatedAtIndex && <p className="mt-1.5 font-semibold text-grey-700">{me.eliminatedAtIndex}번 문제까지 도전했어요</p>}
        </>
      )}
      {finish && finish.podium.length > 0 && (
        <section className="card mt-8 w-full max-w-sm p-5 text-left" aria-label="최종 순위">
          <h2 className="text-sm font-bold text-grey-700">최종 순위</h2>
          <ol className="mt-3 flex flex-col gap-2.5">
            {finish.podium.map((pl) => (
              <li key={pl.rank} className="flex items-start gap-3">
                <span className={`num shrink-0 rounded-full px-3 py-1 text-sm font-extrabold ${podiumTone(pl.rank)}`}>{podiumLabel(pl)}</span>
                <span className="min-w-0 flex-1 pt-0.5 font-semibold">{namesOf(pl.people, 8)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <p className="mt-3 text-sm text-grey-700">수고했어요!</p>
    </div>
  );
}

/** 출제 미리보기: 실제 학생 화면과 같은 카드·타일 (조작은 안 됨) */
export function PhonePreview({ q, seconds }: { q: PublicQuestion; seconds: number }) {
  return (
    <div className="flex h-full flex-col bg-grey-100" aria-hidden="true">
      <div className="px-4 pt-4 pb-3">
        <div className="flex h-9 items-center justify-between">
          <RoundChip q={q} index={1} total={30} />
          <span className="num text-[0.9375rem] font-semibold text-grey-700">생존 87명</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="timer-track h-2 flex-1">
            <div className="timer-fill" />
          </div>
          <div className="num w-12 text-right text-2xl leading-none font-extrabold">{seconds}</div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 pt-2">
        <QuestionCard q={q} />
        {q.type === 'OX' && (
          <div className="grid grid-cols-2 gap-2.5">
            {(['O', 'X'] as const).map((v) => (
              <div key={v} className={`key aspect-[1/1.05] flex-col justify-center gap-3 ${v === 'O' ? 'opt-2' : 'opt-1'}`}>
                <OXGlyph value={v} size={84} stroke={13} color="#fff" />
                <span className="text-xl font-bold">{v === 'O' ? '맞아요' : '틀려요'}</span>
              </div>
            ))}
          </div>
        )}
        {q.type === 'CHOICE' && (
          <div className="flex flex-col gap-2.5">
            {(q.choices ?? []).map((c) => (
              <div key={c.i} className={`key ${optionClass(c.i)}`}>
                <span className="key-badge">{c.i + 1}</span>
                <span className="flex-1 text-[1.125rem]">{c.text || '보기를 입력해 주세요'}</span>
              </div>
            ))}
          </div>
        )}
        {q.type === 'ORDER' && (
          <div className="flex flex-col gap-2.5">
            {(q.items ?? []).map((it) => (
              <div key={it.id} className="key bg-white !text-grey-900">
                <span className="key-badge !bg-grey-100" />
                <span className="flex-1 text-[1.125rem]">{it.text || '항목을 입력해 주세요'}</span>
              </div>
            ))}
          </div>
        )}
        {(q.type === 'SHORT' || q.type === 'INITIAL' || q.type === 'NUMBER') && (
          <div className="card flex flex-col gap-3 p-4">
            <div className="relative">
              <div className={`field flex items-center text-[1.25rem] text-grey-500 ${q.unit ? 'pr-14' : ''}`}>
                {q.type === 'NUMBER' ? '숫자로 입력해 주세요' : '답을 입력해 주세요'}
              </div>
              {q.unit && <span className="absolute top-1/2 right-4 -translate-y-1/2 text-lg font-bold text-grey-700">{q.unit}</span>}
            </div>
            <div className="btn btn-primary btn-lg w-full">제출하기</div>
          </div>
        )}
      </div>
    </div>
  );
}
