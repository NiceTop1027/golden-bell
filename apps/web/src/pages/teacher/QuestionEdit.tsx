import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  DEFAULT_TIME_SEC,
  type Difficulty,
  type QuestionConfig,
  type QuestionDTO,
  type QuestionType,
  STATUS_LABEL,
  TYPE_LABEL,
  makeInitials,
  normalizeShort,
  questionInputSchema,
} from '@gb/shared';
import { api, ApiError } from '../../lib/api.ts';
import { hasStaffPower, useMe } from '../../lib/useMe.ts';
import { Segmented, Shell } from '../../components/Shell.tsx';
import { QuestionPreview } from '../../components/QuestionPreview.tsx';
import { ConfirmDialog, OXGlyph, Spinner, optionClass } from '../../components/ui.tsx';
import { STATUS_TONE } from './Questions.tsx';
import { SubjectOptions } from '../../components/SubjectOptions.tsx';

type EditableType = QuestionType;
const TYPES: EditableType[] = ['OX', 'CHOICE', 'SHORT', 'INITIAL', 'NUMBER', 'ORDER'];
const TYPE_HELP: Record<EditableType, string> = {
  OX: '맞다·틀리다로 답해요',
  CHOICE: '보기 2–5개 중 하나',
  SHORT: '짧은 낱말로 답해요',
  INITIAL: '초성 힌트를 같이 보여 줘요',
  NUMBER: '숫자로 답하고 오차를 정해요',
  ORDER: '항목 3–5개를 순서대로',
};

type Draft = {
  type: EditableType;
  subject: string;
  grade: number | null;
  difficulty: Difficulty;
  body: string;
  mediaId: string | null;
  mediaUrl: string | null;
  ox: 'O' | 'X';
  choices: string[];
  correct: number[];
  answers: string[]; // 단답·초성: 첫 번째가 대표 정답
  showLength: boolean;
  hint: string;
  num: string;
  tol: string;
  unit: string;
  items: string[]; // 순서 맞추기: 맞는 순서대로
  explanation: string;
  timeLimit: string;
  authorNote: string;
};

const EMPTY: Draft = {
  type: 'CHOICE',
  subject: '',
  grade: null,
  difficulty: 'NORMAL',
  body: '',
  mediaId: null,
  mediaUrl: null,
  ox: 'O',
  choices: ['', '', '', ''],
  correct: [],
  answers: [''],
  showLength: false,
  hint: '',
  num: '',
  tol: '0',
  unit: '',
  items: ['', '', ''],
  explanation: '',
  timeLimit: '',
  authorNote: '',
};

function fromDTO(q: QuestionDTO): Draft {
  const d: Draft = {
    ...EMPTY,
    type: q.type,
    subject: q.subject,
    grade: q.grade,
    difficulty: q.difficulty,
    body: q.body,
    mediaId: q.mediaId,
    mediaUrl: q.mediaUrl,
    explanation: q.explanation ?? '',
    timeLimit: q.timeLimitSec ? String(q.timeLimitSec) : '',
    authorNote: q.authorNote ?? '',
  };
  const c = q.config;
  if (c.type === 'OX') d.ox = c.answer;
  if (c.type === 'CHOICE') {
    d.choices = c.choices;
    d.correct = c.answers;
  }
  if (c.type === 'SHORT') {
    d.answers = c.answers;
    d.showLength = !!c.showLength;
  }
  if (c.type === 'INITIAL') {
    d.answers = c.answers;
    d.hint = c.hint;
  }
  if (c.type === 'NUMBER') {
    d.num = String(c.answer);
    d.tol = String(c.tolerance ?? 0);
    d.unit = c.unit ?? '';
  }
  if (c.type === 'ORDER') d.items = c.items.map((i) => i.text);
  return d;
}

function toConfig(d: Draft): QuestionConfig {
  const answers = d.answers.map((a) => a.trim()).filter(Boolean);
  switch (d.type) {
    case 'OX':
      return { type: 'OX', answer: d.ox };
    case 'CHOICE':
      return { type: 'CHOICE', choices: d.choices.map((c) => c.trim()), answers: [...d.correct].sort() };
    case 'SHORT':
      return { type: 'SHORT', answers, showLength: d.showLength };
    case 'INITIAL':
      return { type: 'INITIAL', answers, hint: d.hint.trim() };
    case 'NUMBER':
      return { type: 'NUMBER', answer: Number(d.num.replace(/,/g, '')), tolerance: Number(d.tol || 0), unit: d.unit.trim() || undefined };
    case 'ORDER':
      return { type: 'ORDER', items: d.items.map((t, i) => ({ id: String.fromCharCode(97 + i), text: t.trim() })) };
  }
}

function toPayload(d: Draft) {
  return {
    subject: d.subject,
    grade: d.grade,
    difficulty: d.difficulty,
    body: d.body,
    mediaId: d.mediaId,
    config: toConfig(d),
    explanation: d.explanation,
    timeLimitSec: d.timeLimit ? Number(d.timeLimit) : null,
    authorNote: d.authorNote,
  };
}

/** 저장 전 확인: 서버와 같은 스키마 + 사람이 읽을 문장 */
function validate(d: Draft): string | null {
  if (!d.subject) return '과목을 골라 주세요';
  if (!d.body.trim()) return '문제를 입력해 주세요';
  if (d.type === 'CHOICE') {
    if (d.choices.some((c) => !c.trim())) return '비어 있는 보기가 있어요';
    if (d.correct.length === 0) return '정답 보기를 하나 이상 골라 주세요';
  }
  if ((d.type === 'SHORT' || d.type === 'INITIAL') && !d.answers[0]?.trim()) return '대표 정답을 입력해 주세요';
  if (d.type === 'INITIAL' && !d.hint.trim()) return '초성 힌트를 입력하거나 자동으로 만들어 주세요';
  if (d.type === 'NUMBER' && !Number.isFinite(Number(d.num.replace(/,/g, '')))) return '정답 숫자를 입력해 주세요';
  if (d.type === 'NUMBER' && !d.num.trim()) return '정답 숫자를 입력해 주세요';
  if (d.type === 'ORDER' && d.items.some((t) => !t.trim())) return '비어 있는 항목이 있어요';
  if (d.timeLimit && !(Number(d.timeLimit) >= 5 && Number(d.timeLimit) <= 120)) return '제한시간은 5–120초로 정해 주세요';
  const r = questionInputSchema.safeParse(toPayload(d));
  return r.success ? null : (r.error.issues[0]?.message ?? '입력을 확인해 주세요');
}

// SC-03 문제 작성·수정
export default function QuestionEdit() {
  const me = useMe();
  const { id } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState<QuestionDTO | null>(null);
  const [d, setD] = useState<Draft>(EMPTY);
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState<'save' | 'submit' | 'withdraw' | 'delete' | 'upload' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!me || !id) return;
    api<QuestionDTO>(`/api/questions/${id}`)
      .then((r) => {
        setQ(r);
        setD(fromDTO(r));
      })
      .catch(() => setError('문제를 불러오지 못했어요'))
      .finally(() => setLoading(false));
  }, [me, id]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  // 저장하지 않고 나가려 하면 확인
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    setDirty(true);
    setError(null);
  };

  const isAuthor = !q || (me && q.authorId === me.id);
  // 선생님도 관리자와 권한이 같아 검수 중·승인된 문제도 바로 고칠 수 있음 (상태 유지)
  const locked = !!q && q.status === 'SUBMITTED' && !hasStaffPower(me);
  const reReview = !!q && q.status === 'APPROVED' && !hasStaffPower(me);
  const [previewOpen, setPreviewOpen] = useState(false);
  const cfg = useMemo(() => toConfig(d), [d]);

  async function save(): Promise<QuestionDTO | null> {
    const v = validate(d);
    if (v) {
      setError(v);
      return null;
    }
    const payload = toPayload(d);
    const r = q ? await api<QuestionDTO>(`/api/questions/${q.id}`, { method: 'PATCH', body: payload }) : await api<QuestionDTO>('/api/questions', { body: payload });
    setQ(r);
    setDirty(false);
    if (!id) navigate(`/teacher/questions/${r.id}`, { replace: true });
    return r;
  }

  async function run<T>(kind: NonNullable<typeof busy>, fn: () => Promise<T>) {
    setBusy(kind);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '서버에 연결하지 못했어요');
      return null;
    } finally {
      setBusy(null);
    }
  }

  const onSave = () =>
    run('save', async () => {
      const r = await save();
      if (r) setNotice(r.status === 'SUBMITTED' && q?.status === 'APPROVED' ? '저장했어요. 다시 검수를 받아요' : '저장했어요');
    });
  const onSubmit = () =>
    run('submit', async () => {
      const r = dirty || !q ? await save() : q;
      if (!r) return;
      if (r.status === 'DRAFT' || r.status === 'REJECTED') {
        const s = await api<QuestionDTO>(`/api/questions/${r.id}/submit`, { method: 'POST', body: {} });
        setQ(s);
      }
      setNotice('제출했어요. 검수가 끝나면 알려 드려요');
    });
  const onWithdraw = () =>
    run('withdraw', async () => {
      const r = await api<QuestionDTO>(`/api/questions/${q!.id}/withdraw`, { method: 'POST', body: {} });
      setQ(r);
      setNotice('회수했어요. 이제 고칠 수 있어요');
    });
  const onDelete = () =>
    run('delete', async () => {
      await api(`/api/questions/${q!.id}`, { method: 'DELETE' });
      setDirty(false);
      navigate('/teacher/questions', { replace: true });
    });

  async function upload(file: File) {
    if (file.size > 5 * 1024 * 1024) return setError('이미지는 5MB까지 올릴 수 있어요');
    setBusy('upload');
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/media', { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '올리지 못했어요');
      setD((p) => ({ ...p, mediaId: data.id, mediaUrl: data.url }));
      setDirty(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '올리지 못했어요');
    } finally {
      setBusy(null);
    }
  }

  const title = !id ? '새 문제' : '문제 고치기';

  return (
    <Shell me={me} wide>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link to={q && !isAuthor ? '/admin/review' : '/teacher/questions'} className="btn btn-sm bg-white">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          목록
        </Link>
        <h1 className="display text-[1.75rem] leading-tight">{title}</h1>
        {q && <span className={`chip text-sm ${STATUS_TONE[q.status]}`}>{STATUS_LABEL[q.status]}</span>}
      </div>

      {q && <StatusBanner q={q} locked={locked} busy={busy} onWithdraw={onWithdraw} />}

      {loading ? (
        <p className="flex items-center gap-2 py-16 font-semibold text-grey-700">
          <Spinner className="text-school" /> 불러오는 중
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_440px]">
          <fieldset disabled={locked || busy !== null && busy !== 'upload'} className="flex min-w-0 flex-col gap-4">
            <Section title="문제 유형">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6" role="radiogroup" aria-label="문제 유형">
                {TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={d.type === t}
                    onClick={() => set('type', t)}
                    className={`flex min-h-[72px] flex-col items-start justify-center rounded-[14px] px-4 py-3 text-left transition-[background-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${
                      d.type === t ? 'bg-school-50 shadow-[inset_0_0_0_2px_var(--color-school-deep)]' : 'bg-grey-100 hover:bg-grey-200'
                    }`}
                  >
                    <span className={`font-bold ${d.type === t ? 'text-school-deep' : 'text-grey-900'}`}>{TYPE_LABEL[t]}</span>
                    <span className="mt-0.5 text-xs font-medium text-grey-700">{TYPE_HELP[t]}</span>
                  </button>
                ))}
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <Labeled label="과목">
                  <select className="field" value={d.subject} onChange={(e) => set('subject', e.target.value)}>
                    <option value="">과목 고르기</option>
                    <SubjectOptions current={d.subject} />
                  </select>
                </Labeled>
                <Labeled label="대상 학년">
                  <Segmented
                    label="대상 학년"
                    size="lg"
                    value={d.grade ? String(d.grade) : 'ALL'}
                    onChange={(v) => set('grade', v === 'ALL' ? null : Number(v))}
                    options={[
                      { value: 'ALL', label: '전체' },
                      { value: '1', label: '1' },
                      { value: '2', label: '2' },
                      { value: '3', label: '3' },
                    ]}
                  />
                </Labeled>
                <Labeled label="난이도">
                  <Segmented
                    label="난이도"
                    size="lg"
                    value={d.difficulty}
                    onChange={(v) => set('difficulty', v)}
                    options={[
                      { value: 'EASY', label: '쉬움' },
                      { value: 'NORMAL', label: '보통' },
                      { value: 'HARD', label: '어려움' },
                    ]}
                  />
                </Labeled>
              </div>
            </Section>

            <Section title="문제" aside={<span className={`num text-sm font-semibold ${d.body.length > 280 ? 'text-red' : 'text-grey-600'}`}>{d.body.length} / 300</span>}>
              <textarea
                className="field min-h-[120px] resize-y py-3.5 text-[1.125rem] leading-relaxed"
                value={d.body}
                maxLength={300}
                placeholder="예: 훈민정음을 창제한 왕은?"
                onChange={(e) => set('body', e.target.value)}
                aria-label="문제 내용"
              />
              <ImageField url={d.mediaUrl} busy={busy === 'upload'} onPick={upload} onRemove={() => (set('mediaId', null), set('mediaUrl', null))} />
            </Section>

            <Section title="정답" desc={answerDesc(d.type)}>
              <AnswerFields d={d} set={set} />
            </Section>

            <Section title="해설과 시간">
              <Labeled label="해설" hint="정답을 공개할 때 무대와 학생 화면에 같이 보여요">
                <textarea
                  className="field min-h-[84px] resize-y py-3"
                  maxLength={200}
                  value={d.explanation}
                  placeholder="예: 세종이 1443년에 창제했어요."
                  onChange={(e) => set('explanation', e.target.value)}
                />
              </Labeled>
              <div className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr]">
                <Labeled label="제한시간 (초)">
                  <input
                    className="field num"
                    inputMode="numeric"
                    value={d.timeLimit}
                    placeholder={`${DEFAULT_TIME_SEC[d.type]}초 (기본)`}
                    onChange={(e) => set('timeLimit', e.target.value.replace(/\D/g, '').slice(0, 3))}
                  />
                </Labeled>
                <Labeled label="출제자 메모" hint="검수할 때만 봐요">
                  <input className="field" maxLength={300} value={d.authorNote} placeholder="예: 교과서 54쪽" onChange={(e) => set('authorNote', e.target.value)} />
                </Labeled>
              </div>
            </Section>
          </fieldset>

          <aside className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
            <div className="card p-5">
              <QuestionPreview cfg={cfg} body={d.body} mediaUrl={d.mediaUrl} timeLimitSec={d.timeLimit ? Number(d.timeLimit) : null} />
            </div>
          </aside>
        </div>
      )}

      {!loading && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-grey-200 bg-white">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-end gap-2 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-nowrap sm:px-6">
            {/* 폰에서는 알림이 있을 때만 버튼 위 한 줄로 */}
            <p
              role="status"
              className={`w-full text-sm font-semibold sm:w-auto sm:min-w-0 sm:flex-1 sm:truncate ${error ? 'text-red' : notice ? 'text-green' : 'hidden text-grey-700 sm:block'}`}
            >
              {error ?? notice ?? (dirty ? '저장하지 않은 내용이 있어요' : q ? '저장된 상태예요' : '')}
            </p>
            {q && (q.status === 'DRAFT' || q.status === 'REJECTED') && (
              <button type="button" className="btn bg-transparent px-3 text-red hover:bg-red-50" disabled={busy !== null} onClick={() => setAskDelete(true)}>
                삭제
              </button>
            )}
            <button type="button" className="btn lg:hidden" onClick={() => setPreviewOpen(true)}>
              미리보기
            </button>
            {!locked && reReview ? (
              <button type="button" className="btn btn-primary" disabled={busy !== null || !dirty} onClick={() => void onSave()}>
                {busy === 'save' ? <Spinner /> : '고쳐서 다시 제출하기'}
              </button>
            ) : (
              !locked && (
                <button type="button" className="btn" disabled={busy !== null} onClick={() => void onSave()}>
                  {busy === 'save' ? <Spinner /> : q && q.status !== 'DRAFT' && q.status !== 'REJECTED' ? '저장' : '임시 저장'}
                </button>
              )
            )}
            {!locked && (!q || q.status === 'DRAFT' || q.status === 'REJECTED') && isAuthor && (
              <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void onSubmit()}>
                {busy === 'submit' ? <Spinner /> : q?.status === 'REJECTED' ? '다시 제출하기' : '제출하기'}
              </button>
            )}
          </div>
        </div>
      )}

      <PreviewSheet open={previewOpen} onClose={() => setPreviewOpen(false)}>
        <QuestionPreview cfg={cfg} body={d.body} mediaUrl={d.mediaUrl} timeLimitSec={d.timeLimit ? Number(d.timeLimit) : null} />
      </PreviewSheet>

      <ConfirmDialog
        open={askDelete}
        title="이 문제를 지울까요?"
        onClose={() => setAskDelete(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setAskDelete(false)}>
              취소
            </button>
            <button type="button" className="btn btn-danger" onClick={() => (setAskDelete(false), void onDelete())}>
              지우기
            </button>
          </>
        }
      >
        지운 문제는 되돌릴 수 없어요.
      </ConfirmDialog>
    </Shell>
  );
}

function answerDesc(t: EditableType) {
  if (t === 'CHOICE') return '정답 보기를 눌러 표시해요. 두 개를 고르면 둘 다 정답이에요.';
  if (t === 'SHORT' || t === 'INITIAL') return '띄어쓰기, 문장부호, 영문 대소문자는 무시하고 비교해요.';
  if (t === 'NUMBER') return '쉼표는 무시하고, 허용 오차 안이면 정답이에요.';
  if (t === 'ORDER') return '맞는 순서대로 적어 주세요. 학생에게는 섞어서 보여 주고, 순서가 모두 맞아야 정답이에요.';
  return null;
}

function StatusBanner({ q, locked, busy, onWithdraw }: { q: QuestionDTO; locked: boolean; busy: string | null; onWithdraw: () => void }) {
  if (q.status === 'REJECTED' && q.reviewNote) {
    return (
      <div className="mb-5 rounded-[14px] bg-red-50 px-5 py-4">
        <p className="font-bold text-red-deep">반려 사유: {q.reviewNote}</p>
        <p className="mt-1 text-sm text-grey-800">고친 뒤에 [다시 제출하기]를 눌러 주세요.</p>
      </div>
    );
  }
  if (q.status === 'SUBMITTED') {
    return (
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[14px] bg-school-50 px-5 py-4">
        <p className="min-w-0 flex-1 font-semibold text-grey-900">
          {q.reviewNote ? `다시 검수를 기다리고 있어요. 지난 반려 사유: ${q.reviewNote}` : '검수를 기다리고 있어요.'}
          {locked && <span className="block text-sm font-medium text-grey-700">고치려면 먼저 회수해 주세요.</span>}
        </p>
        {locked && (
          <button type="button" className="btn btn-tint bg-white" disabled={busy !== null} onClick={onWithdraw}>
            {busy === 'withdraw' ? <Spinner /> : '회수하고 고치기'}
          </button>
        )}
      </div>
    );
  }
  if (q.status === 'APPROVED') {
    return (
      <div className="mb-5 rounded-[14px] bg-green-50 px-5 py-4">
        <p className="font-semibold text-grey-900">승인된 문제예요. 고쳐서 저장하면 다시 검수를 받아요.</p>
        {q.usedInContests > 0 && <p className="mt-1 text-sm text-grey-800">이미 대회에 편성됐어요. 편성을 잠근 뒤에 고친 내용은 그 대회에 반영되지 않아요.</p>}
      </div>
    );
  }
  return null;
}

function Section({ title, desc, aside, children }: { title: string; desc?: string | null; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[1.0625rem] font-bold">{title}</h2>
          {desc && <p className="mt-1 text-sm text-grey-700">{desc}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-semibold text-grey-700">
        {label}
        {hint && <span className="ml-1.5 font-medium text-grey-600">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function ImageField({ url, busy, onPick, onRemove }: { url: string | null; busy: boolean; onPick: (f: File) => void; onRemove: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-3">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
      />
      {url ? (
        <div className="flex items-center gap-4 rounded-[14px] bg-grey-50 p-3">
          <img src={url} alt="첨부한 이미지" className="h-20 w-28 rounded-[10px] bg-white object-contain" />
          <div className="flex flex-1 flex-wrap gap-2">
            <button type="button" className="btn btn-sm" onClick={() => input.current?.click()}>
              바꾸기
            </button>
            <button type="button" className="btn btn-sm bg-transparent text-red hover:bg-red-50" onClick={onRemove}>
              빼기
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-sm" onClick={() => input.current?.click()}>
          {busy ? <Spinner /> : '이미지 붙이기'}
          <span className="font-medium text-grey-600">jpg·png·webp, 5MB까지</span>
        </button>
      )}
    </div>
  );
}

function AnswerFields({ d, set }: { d: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void }) {
  if (d.type === 'OX') {
    return (
      <div className="grid max-w-md grid-cols-2 gap-3" role="radiogroup" aria-label="OX 정답">
        {(['O', 'X'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={d.ox === v}
            onClick={() => set('ox', v)}
            className={`key min-h-[96px] flex-col justify-center gap-1.5 ${v === 'O' ? 'opt-2' : 'opt-1'} ${d.ox === v ? '' : 'opacity-35'}`}
            aria-pressed={d.ox === v}
          >
            <OXGlyph value={v} size={44} stroke={13} color="#fff" />
            <span className="text-[0.9375rem] font-bold">{v === 'O' ? '맞아요가 정답' : '틀려요가 정답'}</span>
          </button>
        ))}
      </div>
    );
  }

  if (d.type === 'CHOICE') {
    const setChoice = (i: number, v: string) => set('choices', d.choices.map((c, j) => (j === i ? v : c)));
    const toggle = (i: number) => set('correct', d.correct.includes(i) ? d.correct.filter((x) => x !== i) : [...d.correct, i]);
    const remove = (i: number) => {
      set('choices', d.choices.filter((_, j) => j !== i));
      set('correct', d.correct.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)));
    };
    return (
      <div className="flex flex-col gap-2.5">
        {d.choices.map((c, i) => {
          const on = d.correct.includes(i);
          return (
            <div key={i} className="flex items-center gap-2">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[12px] text-lg font-extrabold ${optionClass(i)}`}>{i + 1}</span>
              <input className="field min-h-12 flex-1" value={c} maxLength={80} placeholder={`보기 ${i + 1}`} onChange={(e) => setChoice(i, e.target.value)} aria-label={`보기 ${i + 1}`} />
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(i)}
                className={`inline-flex min-h-12 shrink-0 items-center gap-1 rounded-[12px] px-3.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${on ? 'bg-green text-white' : 'bg-grey-100 text-grey-700 hover:bg-grey-200'}`}
              >
                {on && (
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                정답
              </button>
              <button
                type="button"
                className="grid min-h-12 w-10 shrink-0 place-items-center rounded-[12px] text-grey-500 hover:bg-grey-100 hover:text-grey-900 disabled:opacity-30"
                disabled={d.choices.length <= 2}
                onClick={() => remove(i)}
                aria-label={`보기 ${i + 1} 빼기`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          );
        })}
        {d.choices.length < 5 && (
          <button type="button" className="btn btn-sm mt-1 self-start" onClick={() => set('choices', [...d.choices, ''])}>
            보기 더하기
          </button>
        )}
      </div>
    );
  }

  if (d.type === 'ORDER') {
    const setItem = (i: number, v: string) => set('items', d.items.map((x, j) => (j === i ? v : x)));
    return (
      <div className="flex flex-col gap-2.5">
        {d.items.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="num grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-school-50 text-lg font-extrabold text-school-deep">{i + 1}</span>
            <input className="field min-h-12 flex-1" value={t} maxLength={60} placeholder={`${i + 1}번째 항목`} onChange={(e) => setItem(i, e.target.value)} aria-label={`${i + 1}번째 항목`} />
            <button
              type="button"
              className="grid min-h-12 w-10 shrink-0 place-items-center rounded-[12px] text-grey-500 hover:bg-grey-100 hover:text-grey-900 disabled:opacity-30"
              disabled={d.items.length <= 3}
              onClick={() => set('items', d.items.filter((_, j) => j !== i))}
              aria-label={`${i + 1}번째 항목 빼기`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
        {d.items.length < 5 && (
          <button type="button" className="btn btn-sm mt-1 self-start" onClick={() => set('items', [...d.items, ''])}>
            항목 더하기
          </button>
        )}
      </div>
    );
  }

  if (d.type === 'NUMBER') {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <Labeled label="정답">
          <input className="field num" inputMode="decimal" value={d.num} placeholder="예: 1446" onChange={(e) => set('num', e.target.value.replace(/[^\d.,-]/g, ''))} />
        </Labeled>
        <Labeled label="허용 오차" hint="±">
          <input className="field num" inputMode="decimal" value={d.tol} onChange={(e) => set('tol', e.target.value.replace(/[^\d.]/g, ''))} />
        </Labeled>
        <Labeled label="단위">
          <input className="field" maxLength={10} value={d.unit} placeholder="예: 년" onChange={(e) => set('unit', e.target.value)} />
        </Labeled>
      </div>
    );
  }

  // 단답·초성
  return (
    <div className="flex flex-col gap-4">
      <Labeled label="대표 정답" hint="정답을 공개할 때 보여요">
        <input
          className="field text-[1.125rem]"
          maxLength={30}
          value={d.answers[0] ?? ''}
          placeholder="예: 세종대왕"
          onChange={(e) => set('answers', [e.target.value, ...d.answers.slice(1)])}
        />
      </Labeled>
      <AltAnswers values={d.answers.slice(1)} onChange={(alts) => set('answers', [d.answers[0] ?? '', ...alts])} />
      {d.answers[0]?.trim() && (
        <p className="text-sm text-grey-700">
          예: <span className="font-semibold text-grey-900">"{d.answers[0]} " · "{d.answers[0].split('').join(' ')}!"</span> 모두{' '}
          <span className="font-semibold text-grey-900">{normalizeShort(d.answers[0])}</span>로 보고 정답 처리해요.
        </p>
      )}
      {d.type === 'INITIAL' ? (
        <Labeled label="초성 힌트">
          <div className="flex gap-2">
            <input className="field flex-1 text-[1.125rem] tracking-[0.15em]" maxLength={30} value={d.hint} placeholder="예: ㅅㅈㄷㅇ" onChange={(e) => set('hint', e.target.value)} />
            <button type="button" className="btn btn-tint shrink-0" disabled={!d.answers[0]?.trim()} onClick={() => set('hint', makeInitials(d.answers[0]!.trim()))}>
              정답에서 만들기
            </button>
          </div>
        </Labeled>
      ) : (
        <label className="flex items-center gap-3 font-semibold">
          <input type="checkbox" className="h-5 w-5 accent-[var(--color-school-deep)]" checked={d.showLength} onChange={(e) => set('showLength', e.target.checked)} />
          학생에게 글자 수 힌트 보여 주기
        </label>
      )}
    </div>
  );
}

function AltAnswers({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (!v || values.includes(v)) return setText('');
    onChange([...values, v]);
    setText('');
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-grey-700">
        같이 인정할 답 <span className="font-medium text-grey-600">· 예: 세종, 세종 대왕</span>
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-school-50 py-1 pr-1 pl-3 text-[0.9375rem] font-semibold text-school-deep">
            {v}
            <button type="button" className="grid h-6 w-6 place-items-center rounded-full hover:bg-school-100" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`${v} 빼기`}>
              <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        <input
          className="field min-h-10 w-48 flex-none py-0 text-[0.9375rem]"
          value={text}
          maxLength={30}
          placeholder="입력하고 Enter"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          aria-label="같이 인정할 답 추가"
        />
      </div>
    </div>
  );
}

/** 폰·태블릿: 미리보기를 아래에서 올라오는 시트로 (확인창 패턴) */
function PreviewSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="gb-dialog mb-0 w-[min(480px,100vw)] max-w-none rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
    >
      {children}
      <button type="button" className="btn mt-4 w-full" onClick={onClose}>
        닫기
      </button>
    </dialog>
  );
}
