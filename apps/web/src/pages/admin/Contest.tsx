import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router';
import { CONTEST_STATUS_LABEL, type ContestDetailDTO, type ContestStatus } from '@gb/shared/types';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/useMe.ts';
import { Shell } from '../../components/Shell.tsx';
import { ConfirmDialog, Spinner } from '../../components/ui.tsx';
import Lineup from './contest/Lineup.tsx';
import Settings from './contest/Settings.tsx';
import Roster from './contest/Roster.tsx';
import Result from './contest/Result.tsx';

export const CONTEST_TONE: Record<ContestStatus, string> = {
  DRAFT: 'bg-grey-200 text-grey-800',
  LOCKED: 'bg-school-50 text-school-deep',
  LIVE: 'bg-school-deep text-white',
  FINISHED: 'bg-green-50 text-green',
};

export type DirtyKey = 'lineup' | 'settings' | 'roster';
export type ContestCtx = {
  c: ContestDetailDTO;
  reload: () => Promise<void>;
  setNotice: (s: string | null) => void;
  /** 저장하지 않은 변경을 위로 알림: 탭 이동·나가기·잠그기를 막는 데 씀 */
  setDirty: (key: DirtyKey, dirty: boolean) => void;
};
const DIRTY_LABEL: Record<DirtyKey, string> = { lineup: '편성', settings: '설정', roster: '명단' };

const TABS = [
  { key: 'lineup', label: '편성' },
  { key: 'settings', label: '설정' },
  { key: 'roster', label: '명단' },
  { key: 'result', label: '결과' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function stageUrl(c: { id: string; stageKey: string | null }) {
  return `${window.location.origin}/stage/${c.id}?key=${encodeURIComponent(c.stageKey ?? '')}`;
}

// SC-09·10·11·13 대회 관리 (관리자)
export default function Contest() {
  const me = useMe();
  const { id = '', tab = 'lineup' } = useParams<{ id: string; tab?: TabKey }>();
  const [c, setC] = useState<ContestDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ask, setAsk] = useState<'lock' | 'unlock' | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dirty, setDirtyMap] = useState<Record<DirtyKey, boolean>>({ lineup: false, settings: false, roster: false });
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const setDirty = useCallback((key: DirtyKey, v: boolean) => setDirtyMap((m) => (m[key] === v ? m : { ...m, [key]: v })), []);
  const dirtyKeys = (Object.keys(dirty) as DirtyKey[]).filter((k) => dirty[k]);
  const anyDirty = dirtyKeys.length > 0;

  const reload = useCallback(async () => {
    try {
      setC(await api<ContestDetailDTO>(`/api/contests/${id}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '대회를 불러오지 못했어요');
    }
  }, [id]);

  useEffect(() => {
    if (me) void reload();
  }, [me, reload]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // 저장하지 않은 변경이 있으면: 새로고침·닫기는 브라우저 확인, 앱 안 링크는 우리 확인창
  useEffect(() => {
    if (!anyDirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith('/api/')) return;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(url.pathname + url.search + url.hash);
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [anyDirty]);
  useEffect(() => setLeaveTo(null), [location.pathname]);

  const leave = () => {
    const to = leaveTo;
    setDirtyMap({ lineup: false, settings: false, roster: false });
    setLeaveTo(null);
    if (to) setTimeout(() => navigate(to), 0);
  };

  async function toggleLock(kind: 'lock' | 'unlock') {
    setBusy(true);
    try {
      await api(`/api/contests/${id}/${kind}`, { method: 'POST', body: {} });
      setNotice(kind === 'lock' ? '편성을 잠갔어요. 이제 진행자 화면에서 대회를 열 수 있어요' : '잠금을 풀었어요. 편성을 고칠 수 있어요');
      await reload();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : '처리하지 못했어요');
    } finally {
      setBusy(false);
      setAsk(null);
    }
  }

  const copyStage = async () => {
    if (!c) return;
    try {
      await navigator.clipboard.writeText(stageUrl(c));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('무대 화면 링크', stageUrl(c));
    }
  };

  const ctx: ContestCtx | null = c ? { c, reload, setNotice, setDirty } : null;
  const rosterEmpty = !!c && c.useRoster && c.rosterCount === 0 && (c.status === 'DRAFT' || c.status === 'LOCKED');
  const lockBlock =
    c?.status === 'DRAFT'
      ? dirty.lineup
        ? '저장하지 않은 편성이 있어요. 편성을 저장한 뒤 잠가 주세요.'
        : c.questions === 0
          ? '편성한 문제가 없어 아직 잠글 수 없어요.'
          : rosterEmpty
            ? '참가 명단 사용이 켜져 있는데 명단이 비어 있어요.'
            : null
      : null;
  const hostTone = c?.status === 'FINISHED' || anyDirty ? 'btn bg-white' : 'btn btn-primary';

  return (
    <Shell me={me} wide>
      {error ? (
        <div className="card px-6 py-12 text-center">
          <p className="font-bold">{error}</p>
          <Link to="/admin" className="btn btn-primary mt-4">
            대회 목록으로
          </Link>
        </div>
      ) : !c || !ctx ? (
        <p className="flex items-center gap-2 py-16 font-semibold text-grey-700">
          <Spinner className="text-school" /> 불러오는 중
        </p>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-start gap-x-4 gap-y-3 max-md:mb-4">
            <Link to="/admin" className="btn btn-sm mt-1 bg-white max-md:hidden">
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              대회
            </Link>
            <div className="min-w-0 flex-1 max-md:w-full max-md:flex-none">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="display text-[1.75rem] leading-tight max-md:text-[1.5rem]">{c.title}</h1>
                <span className={`chip text-sm ${CONTEST_TONE[c.status]}`}>{CONTEST_STATUS_LABEL[c.status]}</span>
              </div>
              <p className="num mt-1 truncate text-[0.9375rem] font-semibold text-grey-700 max-md:text-sm">
                {c.heldOn} · 코드 {c.joinCode} · 문제 {c.questions}개 · 참가자 {c.participants}명
              </p>
            </div>
            <div className="flex flex-col gap-2 md:items-end max-md:w-full">
              <div className="flex flex-wrap gap-2 [&>.btn]:max-md:min-h-10 [&>.btn]:max-md:px-3.5 [&>.btn]:max-md:text-[0.9375rem]">
                {c.status === 'DRAFT' && (
                  <button type="button" className={anyDirty ? 'btn bg-white' : 'btn btn-primary'} disabled={busy || lockBlock !== null} onClick={() => setAsk('lock')} aria-describedby={lockBlock ? 'lock-block' : undefined}>
                    편성 잠그기
                  </button>
                )}
                {c.status === 'LOCKED' && (
                  <button type="button" className="btn bg-white" disabled={busy} onClick={() => setAsk('unlock')}>
                    잠금 풀기
                  </button>
                )}
                {c.status !== 'DRAFT' && (
                  <Link to={`/host/${c.id}`} className={hostTone}>
                    진행자 화면
                  </Link>
                )}
                <button type="button" className="btn bg-white" onClick={() => void copyStage()}>
                  {copied ? '복사했어요' : '무대 링크 복사'}
                </button>
                <a href={`/admin/contests/${c.id}/print`} target="_blank" rel="noreferrer" className="btn bg-white max-md:hidden">
                  인쇄용 문제지
                </a>
              </div>
              {lockBlock && (
                <p id="lock-block" className="text-sm font-semibold text-grey-700">
                  {lockBlock}
                </p>
              )}
            </div>
          </div>

          {rosterEmpty && (
            <div role="alert" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[16px] bg-red-50 px-5 py-3.5">
              <p className="min-w-0 flex-1 font-semibold text-red-deep">
                참가 명단 사용이 켜져 있는데 명단이 비어 있어요. 이대로면 학생이 아무도 들어올 수 없어요.
              </p>
              <div className="flex gap-2">
                <Link to={`/admin/contests/${c.id}/roster`} className="btn btn-sm bg-white">
                  명단 올리기
                </Link>
                <Link to={`/admin/contests/${c.id}/settings`} className="btn btn-sm bg-white">
                  명단 사용 끄기
                </Link>
              </div>
            </div>
          )}

          <nav className="mb-5 flex gap-1 border-b border-grey-200" aria-label="대회 관리">
            {TABS.map((t) => (
              <NavLink
                key={t.key}
                to={`/admin/contests/${c.id}/${t.key}`}
                className={() =>
                  `-mb-px border-b-2 px-4 py-2.5 text-[0.9375rem] font-bold transition-colors ${
                    tab === t.key ? 'border-grey-900 text-grey-900' : 'border-transparent text-grey-600 hover:text-grey-900'
                  }`
                }
              >
                {t.label}
                {dirty[t.key as DirtyKey] && <span className="ml-1.5 inline-block h-1.5 w-1.5 -translate-y-0.5 rounded-full bg-school-deep align-middle" aria-label="저장 안 함" />}
              </NavLink>
            ))}
          </nav>

          {tab === 'settings' ? <Settings {...ctx} /> : tab === 'roster' ? <Roster {...ctx} /> : tab === 'result' ? <Result {...ctx} /> : <Lineup {...ctx} />}

          {notice && (
            <div role="status" className="enter fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
              <div className="rounded-[16px] bg-grey-900/90 px-6 py-3.5 font-semibold text-white">{notice}</div>
            </div>
          )}

          <ConfirmDialog
            open={leaveTo !== null}
            title={`저장하지 않은 ${dirtyKeys.map((k) => DIRTY_LABEL[k]).join('·') || '변경'}이 있어요`}
            onClose={() => setLeaveTo(null)}
            actions={
              <>
                <button type="button" className="btn" onClick={() => setLeaveTo(null)}>
                  계속 고치기
                </button>
                <button type="button" className="btn btn-danger" onClick={leave}>
                  저장하지 않고 나가기
                </button>
              </>
            }
          >
            지금 나가면 바꾼 내용이 사라져요. 저장하려면 [계속 고치기]를 누른 뒤 저장해 주세요.
          </ConfirmDialog>

          <ConfirmDialog
            open={ask !== null}
            title={ask === 'lock' ? '편성을 잠글까요?' : '잠금을 풀까요?'}
            onClose={() => setAsk(null)}
            actions={
              <>
                <button type="button" className="btn" onClick={() => setAsk(null)}>
                  취소
                </button>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => ask && void toggleLock(ask)}>
                  {busy ? <Spinner /> : ask === 'lock' ? '잠그기' : '풀기'}
                </button>
              </>
            }
          >
            {ask === 'lock'
              ? '지금 문제 내용과 정답을 대회용으로 복사해 둬요. 잠근 뒤에 선생님이 원본을 고쳐도 이 대회에는 반영되지 않아요. 잠가야 진행자 화면에서 대회를 열 수 있어요.'
              : '대회를 시작하기 전까지만 풀 수 있어요. 대기실에 들어온 학생은 그대로 있고, 진행 상태는 처음으로 돌아가요.'}
          </ConfirmDialog>
        </>
      )}
    </Shell>
  );
}
