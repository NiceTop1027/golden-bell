import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { type HostCommandType, type HostView, type Phase, type QuestionConfig, TYPE_LABEL } from '@gb/shared/types';
import { api, ApiError, type Me } from '../lib/api.ts';
import { emitAck, getSocket, newCommandId } from '../lib/socket.ts';
import { useCountdown } from '../lib/useCountdown.ts';
import { namesOf, podiumLabel, podiumTone } from '../lib/podium.ts';
import { ConfirmDialog, ConnDot, InitialHint, Logo, RoundChip, Spinner, optionClass } from '../components/ui.tsx';

const PHASE_LABEL: Record<Phase, string> = {
  LOBBY: '대기실',
  READING: '문제 공개',
  ANSWERING: '답변 중',
  CLOSED: '마감',
  REVEALED: '정답 공개',
  CONFIRMED: '결과',
  PAUSED: '일시정지',
  FINISHED: '종료',
};
const PHASE_TONE: Record<Phase, string> = {
  LOBBY: 'bg-grey-100 text-grey-800',
  READING: 'bg-school-50 text-school-deep',
  ANSWERING: 'bg-school-deep text-white',
  CLOSED: 'bg-red-50 text-red-deep',
  REVEALED: 'bg-green-50 text-green',
  CONFIRMED: 'bg-grey-100 text-grey-800',
  PAUSED: 'bg-amber-50 text-grey-900',
  FINISHED: 'bg-grey-900 text-white',
};

type Ask = {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  run: () => void;
  extra?: ReactNode;
};

// SC-14 진행자 화면. 정답이 보이므로 프로젝터에 띄우지 않음
export default function Host() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState<HostView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [busy, setBusy] = useState<HostCommandType | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [answerEdit, setAnswerEdit] = useState(false);
  const [auto, setAuto] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    const s = getSocket();
    let retried = false;
    const attach = async () => {
      const r = await emitAck<{ ok: true; state: HostView } | { ok: false; error: string; message?: string }>((cb) =>
        s.emit('host:attach', { contestId: id }, cb),
      ).catch(() => null);
      if (!alive || !r) return;
      if (r.ok) {
        setError(null);
        setView(r.state);
      } else if (r.error === 'UNAUTHORIZED' && !retried) {
        // 로그인 전에 열린 소켓은 쿠키가 없으므로 다시 연결
        retried = true;
        s.disconnect().connect();
      } else setError(r.message ?? '진행자 화면을 열 수 없어요');
    };
    const onConnect = () => {
      setConnected(true);
      void attach();
    };
    const onDisconnect = () => setConnected(false);
    const onState = (v: unknown) => setView(v as HostView);
    api<Me>('/api/auth/me')
      .then(() => {
        if (!alive) return;
        s.on('connect', onConnect);
        if (s.connected) void attach();
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) navigate(`/login?next=/host/${id}`, { replace: true });
        else setError('서버에 연결하지 못했어요');
      });
    s.on('disconnect', onDisconnect);
    s.on('state', onState);
    return () => {
      alive = false;
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('state', onState);
    };
  }, [id, navigate]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const cmd = useCallback(async (type: HostCommandType, args: Record<string, unknown> = {}) => {
    setBusy(type);
    try {
      const r = await emitAck<{ ok: true } | { ok: false; error: string; message?: string }>((cb) =>
        getSocket().emit('host:command', { commandId: newCommandId(), type, args }, cb),
      );
      if (!r.ok) {
        if (r.error === 'ALL_ELIMINATED') {
          setAsk({
            title: '전원 탈락해요',
            body: '이번 문제 대상자가 모두 틀렸거나 답을 내지 않았어요.',
            confirmLabel: '그대로 확정',
            danger: true,
            run: () => void cmd('CONFIRM', { force: true }),
            extra: (
              <button type="button" className="btn btn-tint" onClick={() => (setAsk(null), void cmd('VOID', { reason: '전원 탈락' }))}>
                이 문제 무효
              </button>
            ),
          });
        } else setNotice(r.message ?? `처리하지 못했어요 (${r.error})`);
        return false;
      }
      return true;
    } catch {
      setNotice('서버 응답이 없어요. 연결을 확인하고 다시 눌러 주세요');
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  // 자동 진행: 한 단계가 끝나면 다음 동작을 확인창 없이 바로 실행. 일시정지하거나 자동을 끄면 멈춤
  useEffect(() => {
    if (autoTimer.current) {
      clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }
    setAutoLeft(0);
    if (!auto || ask || busy || !view) return;
    const ms = AUTO_MS[view.phase];
    if (!ms) return;
    const snapshot = view;
    setAutoLeft(Math.round(ms / 1000));
    autoTimer.current = setTimeout(() => autoRun(snapshot, cmd), ms);
    const iv = setInterval(() => setAutoLeft((n) => (n > 1 ? n - 1 : 0)), 1000);
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, ask, busy, view?.phase, view?.question?.cqId]);

  if (error) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-5 text-center">
        <h1 className="text-2xl font-bold">{error}</h1>
        <Link to="/admin" className="btn btn-primary">
          대회 목록으로
        </Link>
      </main>
    );
  }
  if (!view) {
    return (
      <main className="flex min-h-dvh items-center justify-center gap-3 font-semibold text-grey-700">
        <Spinner className="text-school" /> 진행자 화면 연결 중
      </main>
    );
  }

  const can = (t: HostCommandType) => view.allowed.includes(t) && busy === null;
  const stageUrl = `/stage/${view.contestId}?key=${encodeURIComponent(view.stageKey)}`;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-grey-200 bg-white px-6 py-3">
        <Logo size={36} />
        <div className="min-w-0">
          <h1 className="truncate text-[1.0625rem] leading-tight font-bold">{view.title}</h1>
          <p className="text-xs font-semibold text-red">진행자 화면 · 정답이 보이니 프로젝터에 띄우지 마세요</p>
        </div>
        <span className={`chip ${PHASE_TONE[view.phase]}`}>
          {PHASE_LABEL[view.phase]}
          {view.phase === 'PAUSED' && view.pausedFrom && ` (${PHASE_LABEL[view.pausedFrom]})`}
        </span>
        <span className="num chip bg-grey-100">코드 {view.joinCode}</span>
        <div className="ml-auto flex items-center gap-2">
          <ConnDot connected={connected} />
          <a className="btn btn-sm ml-2" href={stageUrl} target="_blank" rel="noreferrer">
            무대 화면 열기
          </a>
          <a className="btn btn-sm" href={`/api/contests/${view.contestId}/export/alive.csv`}>
            생존자 명단 CSV
          </a>
          <Link className="btn btn-sm" to="/admin">
            대회 목록
          </Link>
        </div>
      </header>

      <main className="grid grid-cols-1 gap-5 p-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,0.95fr)]">
        <CurrentQuestion view={view} />
        <Controls
          view={view}
          can={can}
          busy={busy}
          cmd={cmd}
          setAsk={setAsk}
          openAnswerEdit={() => setAnswerEdit(true)}
          auto={auto}
          autoLeft={autoLeft}
          onToggleAuto={() => setAuto((v) => !v)}
          onAutoNow={() => {
            if (autoTimer.current) clearTimeout(autoTimer.current);
            autoRun(view, cmd);
          }}
        />
        <Side view={view} cmd={cmd} busy={busy} />
      </main>

      {notice && (
        <div role="alert" className="enter fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
          <div className="rounded-[16px] bg-grey-900/90 px-6 py-3.5 font-semibold text-white backdrop-blur">{notice}</div>
        </div>
      )}

      <ConfirmDialog
        open={ask !== null}
        title={ask?.title ?? ''}
        onClose={() => setAsk(null)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setAsk(null)}>
              취소
            </button>
            {ask?.extra}
            <button
              type="button"
              data-confirm
              className={`btn ${ask?.danger ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => {
                const run = ask?.run;
                setAsk(null);
                run?.();
              }}
            >
              {ask?.confirmLabel}
            </button>
          </>
        }
      >
        {ask?.body}
      </ConfirmDialog>

      {answerEdit && view.question && (
        <AnswerEditor
          config={view.question.config}
          onClose={() => setAnswerEdit(false)}
          onSave={async (args) => {
            if (await cmd('SET_ANSWER', args)) setAnswerEdit(false);
          }}
        />
      )}
    </div>
  );
}

function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-[0.9375rem] font-bold text-grey-700">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function CurrentQuestion({ view }: { view: HostView }) {
  const q = view.question;
  const bar = useRef<HTMLDivElement>(null);
  const cd = useCountdown(view.phase, view.timer, bar);
  if (!q) {
    return (
      <Panel title="현재 문제">
        <div className="card flex min-h-[320px] flex-col items-center justify-center gap-2 p-8 text-center">
          {view.phase === 'LOBBY' ? (
            <>
              <p className="display num text-6xl">{view.joinedCount}명</p>
              <p className="font-semibold text-grey-700">참가했어요. 모두 들어오면 [대회 시작]을 눌러 주세요.</p>
            </>
          ) : view.phase === 'FINISHED' ? (
            <>
              <p className="display text-4xl">{view.finish?.goldenBell ? '골든벨 달성!' : '대회 끝'}</p>
              {view.finish?.bellMissed && <p className="font-semibold text-grey-700">골든벨 문제는 틀렸지만 최종 우승</p>}
              {view.finish && view.finish.podium.length > 0 ? (
                <ol className="mt-4 flex w-full max-w-xl flex-col gap-2 text-left">
                  {view.finish.podium.map((pl) => (
                    <li key={pl.rank} className="flex items-start gap-3 rounded-[16px] bg-grey-50 px-4 py-3">
                      <span className={`num shrink-0 rounded-full px-3 py-1 text-sm font-extrabold ${podiumTone(pl.rank)}`}>{podiumLabel(pl)}</span>
                      <span className="min-w-0 flex-1 pt-0.5 font-bold">{namesOf(pl.people, 20, true)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xl font-bold">우승자 없음</p>
              )}
            </>
          ) : (
            <p className="font-semibold text-grey-700">문제가 없어요</p>
          )}
        </div>
      </Panel>
    );
  }
  const cfg = q.config;
  const answering = view.phase === 'ANSWERING' || (view.phase === 'PAUSED' && view.pausedFrom === 'ANSWERING');
  return (
    <Panel title="현재 문제" aside={<span className="num text-sm font-semibold text-grey-700">제한 {q.timeLimitSec}초</span>}>
      <article className="card flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <RoundChip q={q} index={view.index} total={view.total} className="bg-grey-100" />
          {q.kind === 'REVIVAL' && <span className="chip bg-green-50 text-green">대상: 탈락자 {view.progress.targets}명</span>}
        </div>
        <p className="text-[1.5rem] leading-snug font-bold">{q.body}</p>
        {q.hint && <InitialHint hint={q.hint} />}
        {cfg.type === 'CHOICE' && (
          <ol className="grid grid-cols-2 gap-2">
            {cfg.choices.map((c, i) => (
              <li
                key={i}
                className={`flex items-center gap-2 rounded-[14px] px-3 py-2.5 font-bold ${cfg.answers.includes(i) ? optionClass(i) : 'bg-grey-100 text-grey-700'}`}
              >
                <span className="key-badge h-7 w-7 rounded-[8px] text-sm">{i + 1}</span>
                {c}
              </li>
            ))}
          </ol>
        )}
        <div className="rounded-[16px] bg-amber-50 px-5 py-4">
          <p className="text-[1.5rem] leading-snug font-extrabold">정답 {answerSummary(cfg)}</p>
          {q.acceptedExtra.length > 0 && <p className="mt-1 text-sm font-semibold">추가 인정: {q.acceptedExtra.join(', ')}</p>}
          <p className="mt-2 text-sm text-grey-700">
            진행자에게만 보여요.{q.explanation ? ` ${q.explanation}` : ''}
          </p>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <p className="num text-lg font-bold">
              {answering ? `${cd.seconds}초` : PHASE_LABEL[view.phase]} · {view.progress.submitted}/{view.progress.targets}명 제출
            </p>
            <p className="num text-sm font-semibold text-grey-700">
              생존 {view.progress.alive} · 접속 {view.progress.connected}
            </p>
          </div>
          <div className="timer-track mt-2.5 h-2">
            <div ref={bar} className="timer-fill" />
          </div>
        </div>
        {view.reveal && <RevealSummary view={view} />}
      </article>
    </Panel>
  );
}

function answerSummary(cfg: QuestionConfig): string {
  switch (cfg.type) {
    case 'OX':
      return cfg.answer;
    case 'CHOICE':
      return cfg.answers.map((i) => `${i + 1}. ${cfg.choices[i]}`).join(' · ');
    case 'SHORT':
    case 'INITIAL':
      return cfg.answers.join(' / ');
    case 'NUMBER':
      return `${cfg.answer}${cfg.unit ?? ''}${cfg.tolerance ? ` (±${cfg.tolerance})` : ''}`;
    case 'ORDER':
      return cfg.items.map((i) => i.text).join(' → ');
  }
}

function RevealSummary({ view }: { view: HostView }) {
  const s = view.reveal!.stats;
  let text = '';
  if (s.type === 'OX') text = `O ${s.o} · X ${s.x} · 안 냄 ${s.none}`;
  else if (s.type === 'CHOICE') text = `${s.choices.map((c) => `${c.i + 1}번 ${c.count}`).join(' · ')} · 안 냄 ${s.none}`;
  else text = `맞힌 사람 ${s.correct}/${s.total}`;
  return <p className="num rounded-[14px] bg-grey-100 px-4 py-2.5 font-semibold text-grey-800">{text}</p>;
}

function Controls({
  view,
  can,
  busy,
  cmd,
  setAsk,
  openAnswerEdit,
  auto,
  autoLeft,
  onToggleAuto,
  onAutoNow,
}: {
  view: HostView;
  can: (t: HostCommandType) => boolean;
  busy: HostCommandType | null;
  cmd: (t: HostCommandType, a?: Record<string, unknown>) => Promise<boolean>;
  setAsk: (a: Ask) => void;
  openAnswerEdit: () => void;
  auto: boolean;
  autoLeft: number;
  onToggleAuto: () => void;
  onAutoNow: () => void;
}) {
  const wrongCount = useMemo(() => {
    if (view.question?.kind === 'REVIVAL') return view.participants.filter((p) => p.status === 'ELIMINATED' && p.correct === true).length;
    return view.participants.filter((p) => p.status === 'ALIVE' && p.correct !== true).length;
  }, [view]);

  const primary = primaryAction(view, wrongCount, cmd, setAsk);
  const btn = (t: HostCommandType, label: string, onClick: () => void, cls = '') => (
    <button type="button" className={`btn ${cls}`} disabled={!can(t)} onClick={onClick}>
      {busy === t ? <Spinner /> : label}
    </button>
  );

  return (
    <Panel title="진행">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-[14px] bg-grey-100 px-4 py-2.5">
          <div className="min-w-0">
            <p className="font-bold">자동 진행</p>
            <p className="text-sm text-grey-700">
              {auto ? (view.phase === 'LOBBY' ? '[대회 시작]을 누르면 그다음부터 저절로 넘어가요' : '단계가 끝나면 저절로 넘어가요 · 일시정지로 멈춰요') : '직접 버튼을 눌러 한 단계씩 진행해요'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={auto}
            aria-label="자동 진행"
            onClick={onToggleAuto}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${auto ? 'bg-school' : 'bg-grey-300'}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${auto ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        {auto && autoLeft > 0 && AUTO_MS[view.phase] ? (
          <div className="flex items-center justify-between rounded-[14px] bg-school-50 px-4 py-2.5">
            <p className="num font-bold text-school-deep">자동 진행 · {autoLeft}초 후 넘어가요</p>
            <button type="button" className="btn btn-sm bg-white" onClick={onAutoNow}>
              지금 바로
            </button>
          </div>
        ) : auto && view.phase === 'ANSWERING' ? (
          <div className="rounded-[14px] bg-school-50 px-4 py-2.5 font-semibold text-school-deep">답변 시간이 끝나면 자동으로 정답을 공개해요</div>
        ) : null}

        {primary ? (
          <button
            type="button"
            className="btn btn-primary min-h-[104px] flex-col gap-1 rounded-[22px]"
            disabled={!can(primary.type) || busy !== null}
            onClick={primary.onClick}
          >
            {busy === primary.type ? <Spinner /> : <span className="text-[1.75rem] font-extrabold">{primary.label}</span>}
            {primary.hint && <span className="text-sm font-semibold opacity-85">{primary.hint}</span>}
          </button>
        ) : (
          <div className="card px-5 py-7 text-center font-semibold text-grey-700">
            {view.phase === 'ANSWERING' ? '답변 중이에요 · 0초가 되면 자동으로 마감돼요' : '대회가 끝났어요'}
          </div>
        )}

        {view.phase === 'CONFIRMED' && view.canJumpToFinal && (
          <button type="button" className="btn bg-white" disabled={!can('NEXT')} onClick={() => void cmd('NEXT')}>
            골든벨 문제로 가지 않고 일반 문제 계속
          </button>
        )}
        {view.canRevival && (
          <button
            type="button"
            className="btn btn-tint"
            disabled={!can('START_REVIVAL')}
            onClick={() =>
              setAsk({
                title: '패자부활전을 시작할까요?',
                body: `탈락자 ${view.participants.filter((p) => p.status === 'ELIMINATED').length}명이 패자부활 문제에 도전해요.`,
                confirmLabel: '패자부활 시작',
                run: () => void cmd('START_REVIVAL'),
              })
            }
          >
            패자부활 시작
          </button>
        )}

        <div className="card grid grid-cols-2 gap-2 p-3">
          {btn('EXTEND', '+10초', () => void cmd('EXTEND', { sec: 10 }), 'btn-on-white')}
          {btn('CLOSE', '즉시 마감', () =>
            setAsk({ title: '지금 마감할까요?', body: '남은 시간과 상관없이 바로 마감해요.', confirmLabel: '즉시 마감', danger: true, run: () => void cmd('CLOSE') }),
          'btn-on-white')}
          {view.phase === 'PAUSED'
            ? btn('RESUME', '재개', () => void cmd('RESUME'), 'btn-tint')
            : btn('PAUSE', '일시정지', () => void cmd('PAUSE'), 'btn-on-white')}
          {btn('SET_ANSWER', '정답 수정', openAnswerEdit, 'btn-on-white')}
          {btn('UNDO', '되돌리기', () =>
            setAsk({
              title: '방금 탈락 확정을 취소할까요?',
              body: '이번 문제에서 탈락한 학생들이 다시 생존 상태가 되고, 정답 공개 단계로 돌아가요.',
              confirmLabel: '되돌리기',
              run: () => void cmd('UNDO'),
            }),
          'btn-on-white')}
          {btn('VOID', '문제 무효', () =>
            setAsk({
              title: '이 문제를 무효로 할까요?',
              body: `이번 문제의 제출과 탈락을 모두 취소해요. ${view.sparesLeft > 0 ? `예비 문제(${view.sparesLeft}개 남음)로 바로 바꿔요.` : '남은 예비 문제가 없어요.'}`,
              confirmLabel: '문제 무효',
              danger: true,
              run: () => void cmd('VOID', { reason: '진행자 무효 처리' }),
            }),
          'btn-on-white')}
        </div>

        <div className="flex items-center justify-between px-1">
          {view.lastAction ? <p className="text-sm font-semibold text-grey-700">마지막 조작: {view.lastAction}</p> : <span />}
          <button
            type="button"
            className="btn btn-sm bg-transparent text-red hover:bg-red-50"
            disabled={!can('FINISH')}
            onClick={() =>
              setAsk({
                title: '대회를 지금 끝낼까요?',
                body: '지금 생존자가 우승자가 돼요. 되돌릴 수 없어요.',
                confirmLabel: '대회 종료',
                danger: true,
                run: () => void cmd('FINISH'),
              })
            }
          >
            대회 종료
          </button>
        </div>

        {view.next && view.phase !== 'FINISHED' && (
          <div className="card p-5">
            <p className="text-xs font-bold text-grey-700">다음 문제 미리보기</p>
            <p className="mt-1.5 font-bold">
              {view.next.index}번 · {TYPE_LABEL[view.next.type]} · {view.next.body}
            </p>
            <p className="mt-1 text-sm font-semibold text-grey-700">정답: {view.next.answerText}</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

// 자동 진행에서 각 단계가 저절로 넘어가기까지 기다리는 시간(ms). 이 단계들만 자동으로 넘어감
const AUTO_MS: Partial<Record<Phase, number>> = { READING: 5000, CLOSED: 2000, REVEALED: 6000, CONFIRMED: 5000 };

// 자동 진행에서 실행할 다음 동작 — 진행자가 누르는 기본 동작과 같되, 확인창을 거치지 않고 바로 보냄
function autoRun(view: HostView, cmd: (t: HostCommandType, a?: Record<string, unknown>) => Promise<boolean>) {
  switch (view.phase) {
    case 'READING':
      void cmd('START_TIMER');
      break;
    case 'CLOSED':
      void cmd('REVEAL');
      break;
    case 'REVEALED':
      void cmd('CONFIRM');
      break;
    case 'CONFIRMED':
      void cmd('NEXT', view.canJumpToFinal ? { jump: 'FINAL' } : {});
      break;
  }
}

function primaryAction(
  view: HostView,
  wrongCount: number,
  cmd: (t: HostCommandType, a?: Record<string, unknown>) => Promise<boolean>,
  setAsk: (a: Ask) => void,
): { type: HostCommandType; label: string; hint?: string; onClick: () => void } | null {
  switch (view.phase) {
    case 'LOBBY':
      return {
        type: 'START',
        label: '대회 시작',
        hint: `${view.joinedCount}명 참가 중`,
        onClick: () =>
          setAsk({
            title: '대회를 시작할까요?',
            body: `참가자 ${view.joinedCount}명. 시작하면 1번 문제가 무대에 뜨고${view.rules.lateJoin === 'BEFORE_START' ? ', 새 참가는 막혀요(재접속은 돼요)' : ''}.`,
            confirmLabel: '대회 시작',
            run: () => void cmd('START'),
          }),
      };
    case 'READING':
      return { type: 'START_TIMER', label: '타이머 시작', hint: '문제를 다 읽은 뒤 눌러 주세요', onClick: () => void cmd('START_TIMER') };
    case 'CLOSED':
      return { type: 'REVEAL', label: '정답 공개', onClick: () => void cmd('REVEAL') };
    case 'REVEALED':
      if (view.question?.kind === 'REVIVAL') {
        return {
          type: 'CONFIRM',
          label: '부활 확정',
          hint: `맞힌 탈락자 ${wrongCount}명 부활${view.rules.revivalMaxPeople ? ` (최대 ${view.rules.revivalMaxPeople}명)` : ''}`,
          onClick: () => setAsk({ title: '패자부활을 확정할까요?', body: '정답을 맞힌 탈락자가 부활해요.', confirmLabel: '부활 확정', run: () => void cmd('CONFIRM') }),
        };
      }
      if (view.question?.kind === 'FINAL' && view.progress.targets === 1) {
        const hit = wrongCount === 0;
        return {
          type: 'CONFIRM',
          label: '골든벨 결과 확정',
          hint: hit ? '맞혔어요 · 확정하면 골든벨 달성' : '틀렸어요 · 탈락 없이 최종 우승으로 끝나요',
          onClick: () =>
            setAsk({
              title: hit ? '골든벨 달성을 확정할까요?' : '골든벨 실패를 확정할까요?',
              body: hit
                ? '마지막 한 명이 골든벨 문제를 맞혔어요. 확정하면 무대에 골든벨 달성이 떠요.'
                : '마지막 한 명이 골든벨 문제를 틀렸어요. 탈락하지는 않고 최종 우승으로 끝나며, 무대와 학생 화면에는 골든벨 실패로 보여요. 문제에 오류가 있었다면 확정하지 말고 [문제 무효]를 눌러 주세요.',
              confirmLabel: '확정',
              run: () => void cmd('CONFIRM'),
            }),
        };
      }
      return {
        type: 'CONFIRM',
        label: '탈락 확정',
        hint: `틀렸거나 안 낸 학생 ${wrongCount}명`,
        onClick: () =>
          setAsk({
            title: '탈락을 확정할까요?',
            body: `틀렸거나 답을 내지 않은 생존자 ${wrongCount}명이 탈락해요. 확정한 뒤에도 [되돌리기]로 한 번 취소할 수 있어요.`,
            confirmLabel: '탈락 확정',
            danger: true,
            run: () => void cmd('CONFIRM'),
          }),
      };
    case 'CONFIRMED':
      if (view.canJumpToFinal) {
        return { type: 'NEXT', label: '골든벨 문제로', hint: '생존자 1명 · 남은 일반 문제는 건너뛰어요', onClick: () => void cmd('NEXT', { jump: 'FINAL' }) };
      }
      return {
        type: 'NEXT',
        label: view.next || view.aliveCount > 1 ? '다음 문제' : '결과 발표',
        hint: view.next ? `${view.next.index}번 · ${TYPE_LABEL[view.next.type]}` : '남은 문제가 없으면 결과를 발표해요',
        onClick: () => void cmd('NEXT'),
      };
    case 'PAUSED':
      return { type: 'RESUME', label: '재개', onClick: () => void cmd('RESUME') };
    default:
      return null;
  }
}

type Filter = 'ALL' | 'ALIVE' | 'OUT' | 'NOSUB' | 'OFF';

function Side({
  view,
  cmd,
  busy,
}: {
  view: HostView;
  cmd: (t: HostCommandType, a?: Record<string, unknown>) => Promise<boolean>;
  busy: HostCommandType | null;
}) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [reasonFor, setReasonFor] = useState<{ id: string; type: 'REVIVE' | 'ELIMINATE'; label: string } | null>(null);
  const [reason, setReason] = useState('');
  const counts = {
    ALL: view.participants.length,
    ALIVE: view.participants.filter((p) => p.status === 'ALIVE').length,
    OUT: view.participants.filter((p) => p.status === 'ELIMINATED').length,
    NOSUB: view.participants.filter((p) => p.status === 'ALIVE' && !p.submitted).length,
    OFF: view.participants.filter((p) => !p.connected).length,
  };
  const list = view.participants.filter((p) =>
    filter === 'ALIVE'
      ? p.status === 'ALIVE'
      : filter === 'OUT'
        ? p.status === 'ELIMINATED'
        : filter === 'NOSUB'
          ? p.status === 'ALIVE' && !p.submitted
          : filter === 'OFF'
            ? !p.connected
            : true,
  );
  const canManual = view.allowed.includes('REVIVE');

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Panel title="알림">
        {view.alerts.length === 0 ? (
          <p className="card px-5 py-4 text-sm font-semibold text-grey-500">새 알림이 없어요</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {view.alerts.map((a) => (
              <li key={a.id} className="card flex items-center gap-3 px-4 py-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${a.kind === 'DISCONNECTED' ? 'bg-red' : a.kind === 'ONE_LEFT' ? 'bg-amber' : 'bg-school'}`} />
                <span className="min-w-0 flex-1 text-sm font-semibold">
                  {a.kind === 'DEVICE' && `${a.studentNo} ${a.name} 학생이 기기 변경을 요청했어요`}
                  {a.kind === 'SIMILAR' && `비슷한 답 "${a.answer}" ${a.count}명`}
                  {a.kind === 'DISCONNECTED' && `연결이 끊긴 학생 ${a.count}명`}
                  {a.kind === 'ONE_LEFT' && `생존자 1명(${a.name}) · 골든벨 문제로 갈 수 있어요`}
                </span>
                {a.kind === 'DEVICE' && (
                  <span className="flex gap-1.5">
                    <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => void cmd('APPROVE_DEVICE', { participantId: a.participantId })}>
                      승인
                    </button>
                    <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => void cmd('REJECT_DEVICE', { participantId: a.participantId })}>
                      거절
                    </button>
                  </span>
                )}
                {a.kind === 'SIMILAR' && (
                  <button
                    type="button"
                    className="btn btn-sm btn-tint"
                    disabled={!view.allowed.includes('ACCEPT_SIMILAR') || busy !== null}
                    onClick={() => void cmd('ACCEPT_SIMILAR', { normalized: a.normalized })}
                  >
                    정답 인정
                  </button>
                )}
                {a.kind === 'DISCONNECTED' && (
                  <button type="button" className="btn btn-sm" onClick={() => setFilter('OFF')}>
                    보기
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="학생">
        <div className="card overflow-hidden">
          <div className="flex gap-1 overflow-x-auto border-b border-grey-200 p-2" role="tablist" aria-label="학생 목록 필터">
            {(
              [
                ['ALL', '전체'],
                ['ALIVE', '생존'],
                ['OUT', '탈락'],
                ['NOSUB', '미제출'],
                ['OFF', '끊김'],
              ] as [Filter, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={filter === k}
                className={`num shrink-0 rounded-[10px] px-3 py-1.5 text-sm font-bold transition-colors ${filter === k ? 'bg-grey-900 text-white' : 'text-grey-700 hover:bg-grey-100'}`}
                onClick={() => setFilter(k)}
              >
                {label} {counts[k]}
              </button>
            ))}
          </div>
          <div className="max-h-[540px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs text-grey-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">학번</th>
                  <th className="px-2 py-2 font-semibold">이름</th>
                  <th className="px-2 py-2 font-semibold">답</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="num">
                {list.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center font-semibold text-grey-500">
                      해당하는 학생이 없어요
                    </td>
                  </tr>
                )}
                {list.map((p) => (
                  <tr key={p.id} className={`border-t border-grey-100 ${p.status === 'ELIMINATED' ? 'text-grey-500' : ''}`}>
                    <td className="px-4 py-2 font-semibold">
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-green' : 'bg-red'}`} title={p.connected ? '접속 중' : '끊김'} />
                        {p.studentNo}
                      </span>
                    </td>
                    <td className={`px-2 py-2 font-semibold ${p.status === 'ELIMINATED' ? 'line-through' : ''}`}>
                      {p.name}
                      {p.hidden && <span className="ml-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-grey-900 no-underline">화면 밖</span>}
                    </td>
                    <td className="max-w-[9rem] truncate px-2 py-2">
                      {p.answer === null ? (
                        <span className="text-grey-400">—</span>
                      ) : (
                        <span className={p.correct ? 'font-bold text-green' : 'font-semibold text-red'}>{formatAnswer(p.answer, view)}</span>
                      )}
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={!canManual || busy !== null}
                        onClick={() => {
                          setReason('');
                          setReasonFor({ id: p.id, type: p.status === 'ALIVE' ? 'ELIMINATE' : 'REVIVE', label: `${p.studentNo} ${p.name}` });
                        }}
                      >
                        {p.status === 'ALIVE' ? '탈락' : '부활'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      <ConfirmDialog
        open={reasonFor !== null}
        title={reasonFor ? `${reasonFor.label} 학생을 ${reasonFor.type === 'REVIVE' ? '부활' : '탈락'}시킬까요?` : ''}
        onClose={() => setReasonFor(null)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setReasonFor(null)}>
              취소
            </button>
            <button
              type="button"
              className={`btn ${reasonFor?.type === 'REVIVE' ? 'btn-primary' : 'btn-danger'}`}
              disabled={!reason.trim()}
              onClick={() => {
                const r = reasonFor!;
                setReasonFor(null);
                void cmd(r.type, { participantId: r.id, reason: reason.trim() });
              }}
            >
              {reasonFor?.type === 'REVIVE' ? '부활' : '탈락'}
            </button>
          </>
        }
      >
        <label className="mt-2 flex flex-col gap-2">
          <span className="text-sm font-semibold text-grey-700">사유 (진행 기록에 남아요)</span>
          <input className="field" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="예: 판정 항의 확인, 기기 오류" />
        </label>
      </ConfirmDialog>
    </div>
  );
}

function formatAnswer(a: unknown, view: HostView): string {
  const cfg = view.question?.config;
  if (typeof a === 'number' && cfg?.type === 'CHOICE') return `${a + 1}. ${cfg.choices[a] ?? ''}`;
  if (Array.isArray(a)) return a.join('→');
  return String(a);
}

function AnswerEditor({
  config,
  onClose,
  onSave,
}: {
  config: QuestionConfig;
  onClose: () => void;
  onSave: (args: Record<string, unknown>) => void;
}) {
  const [ox, setOx] = useState(config.type === 'OX' ? config.answer : 'O');
  const [choices, setChoices] = useState<number[]>(config.type === 'CHOICE' ? config.answers : []);
  const [texts, setTexts] = useState(config.type === 'SHORT' || config.type === 'INITIAL' ? config.answers.join('\n') : '');
  const [num, setNum] = useState(config.type === 'NUMBER' ? String(config.answer) : '');
  const [tol, setTol] = useState(config.type === 'NUMBER' ? String(config.tolerance ?? 0) : '0');

  const save = () => {
    if (config.type === 'OX') onSave({ answer: ox });
    else if (config.type === 'CHOICE') onSave({ answers: choices });
    else if (config.type === 'SHORT' || config.type === 'INITIAL') onSave({ answers: texts.split('\n').map((t) => t.trim()).filter(Boolean) });
    else if (config.type === 'NUMBER') onSave({ answer: Number(num), tolerance: Number(tol) });
  };

  return (
    <ConfirmDialog
      open
      title="정답 수정"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={config.type === 'CHOICE' && choices.length === 0}>
            저장하고 다시 채점
          </button>
        </>
      }
    >
      <p>다른 답도 인정하면 이 문제의 제출을 모두 다시 채점해요.</p>
      <div className="mt-4 text-grey-900">
        {config.type === 'OX' && (
          <div className="grid grid-cols-2 gap-2">
            {(['O', 'X'] as const).map((v) => (
              <button key={v} type="button" className={`btn ${ox === v ? 'btn-primary' : ''}`} aria-pressed={ox === v} onClick={() => setOx(v)}>
                {v}
              </button>
            ))}
          </div>
        )}
        {config.type === 'CHOICE' && (
          <div className="flex flex-col gap-2">
            {config.choices.map((c, i) => (
              <label key={i} className="flex items-center gap-3 rounded-[12px] bg-grey-100 px-3 py-2.5 font-semibold">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--color-school-deep)]"
                  checked={choices.includes(i)}
                  onChange={(e) => setChoices((p) => (e.target.checked ? [...p, i] : p.filter((x) => x !== i)))}
                />
                {i + 1}. {c}
              </label>
            ))}
            <p className="text-xs text-grey-700">두 개 이상 고르면 둘 다 정답으로 인정해요.</p>
          </div>
        )}
        {(config.type === 'SHORT' || config.type === 'INITIAL') && (
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-grey-700">인정할 답 (한 줄에 하나)</span>
            <textarea className="field min-h-32 py-3" value={texts} onChange={(e) => setTexts(e.target.value)} />
          </label>
        )}
        {config.type === 'NUMBER' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-grey-700">정답</span>
              <input className="field" inputMode="decimal" value={num} onChange={(e) => setNum(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-grey-700">허용 오차</span>
              <input className="field" inputMode="decimal" value={tol} onChange={(e) => setTol(e.target.value)} />
            </label>
          </div>
        )}
      </div>
    </ConfirmDialog>
  );
}
