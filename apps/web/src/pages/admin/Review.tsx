import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  DEFAULT_TIME_SEC,
  DIFFICULTY_LABEL,
  type QuestionDTO,
  type QuestionListDTO,
  type QuestionStatus,
  STATUS_LABEL,
  TYPE_LABEL,
} from '@gb/shared/types';
import { api, ApiError } from '../../lib/api.ts';
import { answerSummary } from '../../lib/answer.ts';
import { useMe } from '../../lib/useMe.ts';
import { PageHead, Segmented, Shell } from '../../components/Shell.tsx';
import { QuestionPreview } from '../../components/QuestionPreview.tsx';
import { ConfirmDialog, Spinner } from '../../components/ui.tsx';
import { STATUS_TONE } from '../teacher/Questions.tsx';
import { SubjectOptions } from '../../components/SubjectOptions.tsx';

type Tab = Exclude<QuestionStatus, 'DRAFT'>;

// SC-07 문제 검수 (관리자)
export default function Review() {
  const me = useMe();
  const [data, setData] = useState<QuestionListDTO | null>(null);
  const [tab, setTab] = useState<Tab>('SUBMITTED');
  const [subject, setSubject] = useState('');
  const [author, setAuthor] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => api<QuestionListDTO>('/api/questions').then(setData);
  useEffect(() => {
    if (me) void load().catch(() => setError('문제 목록을 불러오지 못했어요'));
  }, [me]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const authors = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of data?.items ?? []) if (q.status !== 'DRAFT') m.set(q.authorId, q.authorName);
    return [...m.entries()];
  }, [data]);
  const queue = useMemo(
    () =>
      (data?.items ?? [])
        .filter((q) => q.status === tab && (!subject || q.subject === subject) && (!author || q.authorId === author))
        // 검수 대기는 먼저 낸 것부터
        .sort((a, b) => (tab === 'SUBMITTED' ? a.updatedAt.localeCompare(b.updatedAt) : b.updatedAt.localeCompare(a.updatedAt))),
    [data, tab, subject, author],
  );
  const current = queue.find((q) => q.id === selected) ?? queue[0] ?? null;
  const [similar, setSimilar] = useState<{ id: string; body: string; subject: string; authorName: string; status: string }[]>([]);
  useEffect(() => {
    setSimilar([]);
    if (!current) return;
    let alive = true;
    void api<typeof similar>(`/api/questions/${current.id}/similar`)
      .then((r) => alive && setSimilar(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  async function review(result: 'APPROVE' | 'REJECT') {
    if (!current) return;
    setBusy(result === 'APPROVE' ? 'approve' : 'reject');
    setError(null);
    try {
      await api(`/api/questions/${current.id}/review`, { body: result === 'APPROVE' ? { result } : { result, note: reason.trim() } });
      const idx = queue.findIndex((q) => q.id === current.id);
      const next = queue[idx + 1] ?? queue[idx - 1] ?? null;
      setSelected(next?.id ?? null);
      setRejectOpen(false);
      setReason('');
      setNotice(result === 'APPROVE' ? '승인했어요' : '반려했어요. 선생님 화면에 사유가 보여요');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '처리하지 못했어요');
    } finally {
      setBusy(null);
    }
  }

  const approvedEntries = Object.entries(data?.approvedBySubject ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <Shell me={me} wide>
      <PageHead
        title="문제 검수"
        desc={data ? `검수 대기 ${data.counts.SUBMITTED}문제 · 승인 ${data.counts.APPROVED}문제` : '선생님들이 제출한 문제를 확인하고 승인하거나 반려해요.'}
      />

      {approvedEntries.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-grey-700">과목별 승인</span>
          {approvedEntries.map(([s, n]) => (
            <span key={s} className="num rounded-full bg-white px-3 py-1 text-sm font-semibold text-grey-800">
              {s} {n}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col gap-3">
          <Segmented
            label="상태"
            value={tab}
            onChange={(v) => (setTab(v), setSelected(null))}
            options={(['SUBMITTED', 'APPROVED', 'REJECTED'] as Tab[]).map((s) => ({
              value: s,
              label: `${s === 'SUBMITTED' ? '검수 대기' : STATUS_LABEL[s]} ${data?.counts[s] ?? 0}`,
            }))}
          />
          <div className="flex gap-2">
            <select className="field min-h-10 bg-white flex-1 py-0 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="과목">
              <option value="">모든 과목</option>
              <SubjectOptions />
            </select>
            <select className="field min-h-10 bg-white flex-1 py-0 text-sm" value={author} onChange={(e) => setAuthor(e.target.value)} aria-label="출제자">
              <option value="">모든 선생님</option>
              {authors.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="card max-h-[calc(100dvh-300px)] min-h-[200px] overflow-auto">
            {!data ? (
              <p className="flex items-center justify-center gap-2 px-6 py-12 font-semibold text-grey-700">
                <Spinner className="text-school" /> 불러오는 중
              </p>
            ) : queue.length === 0 ? (
              <p className="px-6 py-12 text-center font-semibold text-grey-700">{tab === 'SUBMITTED' ? '검수할 문제가 없어요' : '해당하는 문제가 없어요'}</p>
            ) : (
              <ul className="divide-y divide-grey-100">
                {queue.map((q) => (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(q.id)}
                      aria-current={current?.id === q.id}
                      className={`flex w-full flex-col gap-1 px-5 py-4 text-left transition-colors ${current?.id === q.id ? 'bg-school-50' : 'hover:bg-grey-50'}`}
                    >
                      <span className="text-sm font-semibold text-grey-700">
                        <span className="text-grey-900">{TYPE_LABEL[q.type]}</span> · {q.subject} · {q.authorName}
                      </span>
                      <span className="line-clamp-2 font-semibold text-grey-900">{q.body}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="min-w-0">
          {current ? (
            <div className="card grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="flex min-w-0 flex-col gap-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`chip text-sm ${STATUS_TONE[current.status]}`}>{STATUS_LABEL[current.status]}</span>
                  <span className="text-sm font-semibold text-grey-700">
                    {current.authorName} 선생님 · {new Date(current.updatedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                <h2 className="text-[1.375rem] leading-snug font-bold">{current.body}</h2>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[0.9375rem] sm:grid-cols-3">
                  <Fact k="유형" v={TYPE_LABEL[current.type]} />
                  <Fact k="과목" v={current.subject} />
                  <Fact k="학년" v={current.grade ? `${current.grade}학년` : '전체'} />
                  <Fact k="난이도" v={DIFFICULTY_LABEL[current.difficulty]} />
                  <Fact k="제한시간" v={`${current.timeLimitSec ?? DEFAULT_TIME_SEC[current.type]}초${current.timeLimitSec ? '' : ' (기본)'}`} />
                  <Fact k="편성" v={current.usedInContests ? `대회 ${current.usedInContests}곳` : '아직 없음'} />
                </dl>
                <div className="rounded-[14px] bg-green-50 px-5 py-4">
                  <p className="text-[1.25rem] font-extrabold">정답 {answerSummary(current.config)}</p>
                  {current.config.type === 'INITIAL' && <p className="mt-1 text-sm font-semibold text-grey-800">초성 힌트 {current.config.hint}</p>}
                  {current.explanation && <p className="mt-2 text-[0.9375rem] text-grey-800">{current.explanation}</p>}
                </div>
                {similar.length > 0 && (
                  <div className="rounded-[14px] bg-amber-50 px-4 py-3">
                    <p className="font-semibold text-grey-900">비슷한 문제가 있어요</p>
                    <ul className="mt-1.5 flex flex-col gap-1 text-[0.9375rem] text-grey-800">
                      {similar.map((s) => (
                        <li key={s.id}>
                          "{s.body}" · {s.subject} · {s.authorName} · {s.status === 'APPROVED' ? '승인됨' : '검수 대기'}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {current.authorNote && (
                  <p className="rounded-[14px] bg-grey-50 px-4 py-3 text-[0.9375rem] text-grey-800">
                    <span className="font-semibold text-grey-900">출제자 메모</span> {current.authorNote}
                  </p>
                )}
                {current.reviewNote && (
                  <p className="rounded-[14px] bg-red-50 px-4 py-3 text-[0.9375rem] font-semibold text-red-deep">
                    {current.status === 'REJECTED' ? '반려 사유' : '지난 반려 사유'}: {current.reviewNote}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-grey-100 pt-5">
                  <p role="status" className={`min-w-0 flex-1 text-sm font-semibold ${error ? 'text-red' : 'text-green'}`}>
                    {error ?? notice ?? ''}
                  </p>
                  <Link to={`/teacher/questions/${current.id}`} className="btn btn-sm bg-transparent text-grey-700 hover:bg-grey-100">
                    직접 고치기
                  </Link>
                  {current.status === 'SUBMITTED' && (
                    <>
                      <button type="button" className="btn" disabled={busy !== null} onClick={() => (setReason(''), setRejectOpen(true))}>
                        반려
                      </button>
                      <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void review('APPROVE')}>
                        {busy === 'approve' ? <Spinner /> : '승인'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <QuestionPreview cfg={current.config} body={current.body} mediaUrl={current.mediaUrl} timeLimitSec={current.timeLimitSec} />
              </div>
            </div>
          ) : (
            data && (
              <div className="card px-6 py-16 text-center">
                <p className="text-lg font-bold">{tab === 'SUBMITTED' ? '모든 문제를 검수했어요' : '고를 문제가 없어요'}</p>
                <p className="mt-1.5 text-grey-700">선생님들이 문제를 제출하면 여기에 쌓여요.</p>
              </div>
            )
          )}
        </section>
      </div>

      <ConfirmDialog
        open={rejectOpen}
        title="반려할까요?"
        onClose={() => setRejectOpen(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setRejectOpen(false)}>
              취소
            </button>
            <button type="button" className="btn btn-danger" disabled={!reason.trim() || busy !== null} onClick={() => void review('REJECT')}>
              {busy === 'reject' ? <Spinner /> : '반려하기'}
            </button>
          </>
        }
      >
        <p>사유는 선생님 화면에 그대로 보여요. 무엇을 고치면 되는지 적어 주세요.</p>
        <textarea
          className="field mt-3 min-h-28 py-3 text-grey-900"
          maxLength={300}
          value={reason}
          placeholder="예: 보기 2와 3이 둘 다 정답이 될 수 있어요"
          onChange={(e) => setReason(e.target.value)}
          aria-label="반려 사유"
        />
      </ConfirmDialog>
    </Shell>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-grey-600">{k}</dt>
      <dd className="mt-0.5 font-semibold text-grey-900">{v}</dd>
    </div>
  );
}
