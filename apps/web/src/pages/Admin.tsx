import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CONTEST_STATUS_LABEL, type ContestSummaryDTO } from '@gb/shared/types';
import { api, ApiError } from '../lib/api.ts';
import { hasStaffPower, useMe } from '../lib/useMe.ts';
import { PageHead, Shell } from '../components/Shell.tsx';
import { ConfirmDialog, Spinner } from '../components/ui.tsx';
import { CONTEST_TONE, stageUrl } from './admin/Contest.tsx';

const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// SC-08 대회 목록 (관리자: 만들기·관리, 진행 권한 선생님: 진행자 화면)
export default function Admin() {
  const me = useMe();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ContestSummaryDTO[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [heldOn, setHeldOn] = useState(today());
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = () => api<ContestSummaryDTO[]>('/api/contests').then(setRows);
  useEffect(() => {
    if (me) void load().catch(() => setError('목록을 불러오지 못했어요'));
  }, [me]);

  const copy = async (c: ContestSummaryDTO) => {
    try {
      await navigator.clipboard.writeText(stageUrl(c));
      setCopied(c.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt('무대 화면 링크', stageUrl(c));
    }
  };

  async function create() {
    setBusy(true);
    setCreateError(null);
    try {
      const r = await api<{ id: string }>('/api/contests', { body: { title: title.trim(), heldOn } });
      navigate(`/admin/contests/${r.id}/lineup`);
    } catch (e) {
      setCreateError(e instanceof ApiError ? e.message : '만들지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  const isAdmin = hasStaffPower(me); // 선생님도 대회를 만들고 관리함

  return (
    <Shell me={me}>
      <PageHead
        title="대회"
        desc="대회를 만들고 문제를 편성해요. 잠그면 진행자 화면에서 열 수 있어요."
        action={
          isAdmin && (
            <button type="button" className="btn btn-primary" onClick={() => (setTitle(''), setHeldOn(today()), setCreateError(null), setCreateOpen(true))}>
              새 대회
            </button>
          )
        }
      />
      {error && <p className="font-semibold text-red">{error}</p>}
      {!rows && !error && (
        <p className="flex items-center gap-2 font-semibold text-grey-700">
          <Spinner className="text-school" /> 불러오는 중
        </p>
      )}
      {rows?.length === 0 && (
        <div className="card px-6 py-14 text-center">
          <p className="text-lg font-bold">{isAdmin ? '아직 만든 대회가 없어요' : '진행할 수 있는 대회가 없어요'}</p>
          <p className="mt-1.5 text-grey-700">{isAdmin ? '[새 대회]로 만들고 승인된 문제를 편성해 주세요.' : '승인된 문제를 편성해 대회를 열 수 있어요.'}</p>
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {rows?.map((c) => (
          <li key={c.id} className="card flex flex-wrap items-center gap-x-6 gap-y-4 p-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`chip text-sm ${CONTEST_TONE[c.status]}`}>{CONTEST_STATUS_LABEL[c.status]}</span>
                <span className="num text-sm font-semibold text-grey-700">{c.heldOn}</span>
              </div>
              <h2 className="mt-2 text-xl font-bold">
                {c.canManage ? (
                  <Link to={`/admin/contests/${c.id}`} className="hover:underline hover:underline-offset-4">
                    {c.title}
                  </Link>
                ) : (
                  c.title
                )}
              </h2>
              <p className="num mt-1 text-sm font-semibold text-grey-700">
                참가 코드 {c.joinCode} · 문제 {c.questions}개 · 참가자 {c.participants}명
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {c.canManage && (
                <Link to={`/admin/contests/${c.id}`} className="btn">
                  관리
                </Link>
              )}
              {c.status === 'FINISHED' && c.canManage ? (
                <Link to={`/admin/contests/${c.id}/result`} className="btn">
                  결과
                </Link>
              ) : (
                c.status !== 'DRAFT' && (
                  <Link to={`/host/${c.id}`} className={c.status === 'LIVE' ? 'btn btn-primary' : c.status === 'LOCKED' ? 'btn btn-tint' : 'btn'}>
                    진행자 화면
                  </Link>
                )
              )}
              {c.status !== 'DRAFT' && c.status !== 'FINISHED' && (
                <button type="button" className="btn" onClick={() => void copy(c)}>
                  {copied === c.id ? '복사했어요' : '무대 링크 복사'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={createOpen}
        title="새 대회"
        onClose={() => setCreateOpen(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setCreateOpen(false)}>
              취소
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || !title.trim()} onClick={() => void create()}>
              {busy ? <Spinner /> : '만들고 편성하기'}
            </button>
          </>
        }
      >
        <div className="mt-2 flex flex-col gap-3 text-grey-900">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-grey-700">대회 이름</span>
            <input className="field" maxLength={60} value={title} placeholder="예: 제1회 덕영 골든벨" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-grey-700">날짜</span>
            <input className="field num" type="date" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />
          </label>
          <p className="text-sm text-grey-700">참가 코드와 무대 링크는 자동으로 만들어져요.</p>
          {createError && <p className="text-sm font-semibold text-red">{createError}</p>}
        </div>
      </ConfirmDialog>
    </Shell>
  );
}
