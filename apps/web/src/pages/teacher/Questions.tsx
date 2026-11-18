import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  DIFFICULTY_LABEL,
  type QuestionDTO,
  type QuestionListDTO,
  type QuestionStatus,
  type QuestionType,
  STATUS_LABEL,
  TYPE_LABEL,
} from '@gb/shared/types';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/useMe.ts';
import { PageHead, Segmented, Shell } from '../../components/Shell.tsx';
import { Spinner } from '../../components/ui.tsx';
import { SubjectOptions } from '../../components/SubjectOptions.tsx';

export const STATUS_TONE: Record<QuestionStatus, string> = {
  DRAFT: 'bg-grey-100 text-grey-700',
  SUBMITTED: 'bg-school-50 text-school-deep',
  APPROVED: 'bg-green-50 text-green',
  REJECTED: 'bg-red-50 text-red-deep',
};

const EDITABLE_TYPES: QuestionType[] = ['OX', 'CHOICE', 'SHORT', 'INITIAL', 'NUMBER', 'ORDER'];

// SC-02 내 문제 목록 (선생님)
export default function Questions() {
  const me = useMe();
  const [data, setData] = useState<QuestionListDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<QuestionStatus | 'ALL'>('ALL');
  const [type, setType] = useState<QuestionType | ''>('');
  const [subject, setSubject] = useState('');

  useEffect(() => {
    if (!me) return;
    api<QuestionListDTO>('/api/questions?author=me')
      .then(setData)
      .catch(() => setError('문제 목록을 불러오지 못했어요'));
  }, [me]);

  const items = useMemo(
    () =>
      (data?.items ?? []).filter(
        (q) => (status === 'ALL' || q.status === status) && (!type || q.type === type) && (!subject || q.subject === subject),
      ),
    [data, status, type, subject],
  );
  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <Shell me={me}>
      <PageHead
        title="내 문제"
        desc={data && total > 0 ? `모두 ${total}문제를 썼어요. 제출하면 검수를 거쳐요.` : '문제를 쓰고 제출하면 검수를 거쳐요.'}
        action={
          <div className="flex gap-2">
            <Link to="/teacher/import" className="btn bg-white">
              엑셀로 올리기
            </Link>
            <Link to="/teacher/questions/new" className="btn btn-primary">
              새 문제 쓰기
            </Link>
          </div>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented
          label="상태"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ALL', label: `전체 ${total}` },
            ...(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] as QuestionStatus[]).map((s) => ({
              value: s,
              label: `${STATUS_LABEL[s]} ${data?.counts[s] ?? 0}`,
            })),
          ]}
        />
        <div className="flex gap-2">
          <select className="field min-h-10 bg-white w-auto py-0 pr-8 text-sm" value={type} onChange={(e) => setType(e.target.value as QuestionType | '')} aria-label="유형">
            <option value="">모든 유형</option>
            {EDITABLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <select className="field min-h-10 bg-white w-auto py-0 pr-8 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="과목">
            <option value="">모든 과목</option>
            <SubjectOptions />
          </select>
        </div>
      </div>

      <section className="card mt-4 overflow-hidden">
        {error ? (
          <p className="px-6 py-10 text-center font-semibold text-red">{error}</p>
        ) : !data ? (
          <p className="flex items-center justify-center gap-2 px-6 py-12 font-semibold text-grey-700">
            <Spinner className="text-school" /> 불러오는 중
          </p>
        ) : items.length === 0 ? (
          <Empty hasAny={total > 0} />
        ) : (
          <ul className="divide-y divide-grey-100">
            {items.map((q) => (
              <QuestionRow key={q.id} q={q} />
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}

export function QuestionRow({ q, to, showAuthor = false }: { q: QuestionDTO; to?: string; showAuthor?: boolean }) {
  return (
    <li>
      <Link to={to ?? `/teacher/questions/${q.id}`} className="flex gap-4 px-5 py-4 transition-colors hover:bg-grey-50 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-grey-700">
            <span className="text-grey-900">{TYPE_LABEL[q.type]}</span>
            {[q.subject, q.grade ? `${q.grade}학년` : null, DIFFICULTY_LABEL[q.difficulty], showAuthor ? q.authorName : null, q.mediaUrl ? '이미지' : null]
              .filter(Boolean)
              .map((x) => ` · ${x}`)
              .join('')}
          </p>
          <p className="mt-1 line-clamp-2 text-[1.0625rem] leading-snug font-semibold text-grey-900">{q.body}</p>
          {q.status === 'REJECTED' && q.reviewNote && (
            <p className="mt-2 rounded-[10px] bg-red-50 px-3 py-2 text-sm font-semibold text-red-deep">반려 사유: {q.reviewNote}</p>
          )}
        </div>
        <span className={`chip h-7 shrink-0 self-start text-sm ${STATUS_TONE[q.status]}`}>{STATUS_LABEL[q.status]}</span>
      </Link>
    </li>
  );
}

function Empty({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="text-lg font-bold">{hasAny ? '조건에 맞는 문제가 없어요' : '아직 쓴 문제가 없어요'}</p>
      <p className="max-w-sm text-[0.9375rem] text-grey-700">
        {hasAny ? '다른 상태나 과목을 골라 보세요.' : 'OX, 객관식, 단답, 초성, 숫자 문제를 쓸 수 있어요. 학생 폰과 무대 화면에 어떻게 보이는지 바로 확인하면서 쓰면 돼요.'}
      </p>
      {!hasAny && (
        <Link to="/teacher/questions/new" className="btn btn-primary mt-2">
          첫 문제 쓰기
        </Link>
      )}
    </div>
  );
}
