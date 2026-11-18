import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DEFAULT_TIME_SEC,
  DIFFICULTY_LABEL,
  FINAL_TIME_SEC,
  type QuestionDTO,
  type QuestionListDTO,
  type QuestionType,
  ROUND_LABEL,
  type Round,
  TYPE_LABEL,
} from '@gb/shared/types';
import { api, ApiError } from '../../../lib/api.ts';
import { answerSummary } from '../../../lib/answer.ts';
import { Segmented } from '../../../components/Shell.tsx';
import { Spinner } from '../../../components/ui.tsx';
import type { ContestCtx } from '../Contest.tsx';
import { SubjectOptions } from '../../../components/SubjectOptions.tsx';

type Item = { questionId: string; round: Round; timeLimitSec: number | null; q: QuestionDTO; body: string };

const ROUNDS: Round[] = ['PRELIM', 'MAIN', 'REVIVAL', 'FINAL', 'SPARE'];
const ROUND_TONE: Record<Round, string> = {
  PRELIM: 'bg-grey-100 text-grey-800',
  MAIN: 'bg-school-50 text-school-deep',
  REVIVAL: 'bg-green-50 text-green',
  FINAL: 'bg-amber-50 text-grey-900',
  SPARE: 'bg-grey-50 text-grey-700',
};
const DIFF_ORDER = { EASY: 0, NORMAL: 1, HARD: 2 } as const;
const PAD_SEC = 40; // 진행 여유 (5.6)

const limitOf = (it: Item) => it.timeLimitSec ?? it.q.timeLimitSec ?? (it.round === 'FINAL' ? FINAL_TIME_SEC : DEFAULT_TIME_SEC[it.q.type]);

/** 같은 과목이 연달아 나오지 않게 난이도순 (C-07) */
function spreadBySubject(list: Item[]) {
  const pool = [...list].sort((a, b) => DIFF_ORDER[a.q.difficulty] - DIFF_ORDER[b.q.difficulty]);
  const out: Item[] = [];
  while (pool.length) {
    const prev = out.at(-1)?.q.subject;
    const i = pool.findIndex((x) => x.q.subject !== prev);
    out.push(...pool.splice(i >= 0 ? i : 0, 1));
  }
  return out;
}

/** 부록 B 모양: 예선 → 본선 앞 절반 → 패자부활 → 본선 뒤 절반 → 결승 → 예비 */
function autoArrange(items: Item[]) {
  const by = (r: Round) => items.filter((i) => i.round === r);
  const main = spreadBySubject(by('MAIN'));
  const half = Math.ceil(main.length / 2);
  return [...spreadBySubject(by('PRELIM')), ...main.slice(0, half), ...by('REVIVAL'), ...main.slice(half), ...by('FINAL'), ...by('SPARE')];
}

export default function Lineup({ c, reload, setNotice, setDirty: reportDirty }: ContestCtx) {
  const editable = c.status === 'DRAFT';
  const initial = useMemo<Item[]>(
    () => c.lineup.map((l) => ({ questionId: l.questionId, round: l.round, timeLimitSec: l.timeLimitSec, q: l.question, body: l.locked?.body ?? l.question.body })),
    [c],
  );
  const [items, setItems] = useState<Item[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [bank, setBank] = useState<QuestionDTO[] | null>(null);
  const [addRound, setAddRound] = useState<Round>('MAIN');
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [type, setType] = useState<QuestionType | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(initial);
    setDirty(false);
  }, [initial]);
  useEffect(() => {
    reportDirty('lineup', dirty);
  }, [dirty, reportDirty]);
  useEffect(() => () => reportDirty('lineup', false), [reportDirty]);
  useEffect(() => {
    if (editable) void api<QuestionListDTO>('/api/questions?status=APPROVED').then((r) => setBank(r.items));
  }, [editable]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const change = (next: Item[]) => {
    setItems(next);
    setDirty(true);
    setError(null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((i) => i.questionId === e.active.id);
    const to = items.findIndex((i) => i.questionId === e.over!.id);
    change(arrayMove(items, from, to));
  };

  const inLineup = new Set(items.map((i) => i.questionId));
  const bankShown = (bank ?? []).filter(
    (q) =>
      !inLineup.has(q.id) &&
      (!subject || q.subject === subject) &&
      (!type || q.type === type) &&
      (!search.trim() || q.body.includes(search.trim()) || q.authorName.includes(search.trim())),
  );

  // 요약·경고 (5.6)
  const play = items.filter((i) => i.round !== 'SPARE');
  const minutes = Math.round(play.reduce((s, i) => s + limitOf(i) + PAD_SEC, 0) / 60);
  const count = (r: Round) => items.filter((i) => i.round === r).length;
  const typeCounts = Object.entries(
    play.reduce<Record<string, number>>((m, i) => ((m[TYPE_LABEL[i.q.type]] = (m[TYPE_LABEL[i.q.type]] ?? 0) + 1), m), {}),
  );
  const warnings = [
    count('FINAL') === 0 && '결승(골든벨) 문제가 없어요',
    count('SPARE') === 0 && '예비 문제가 없어요. 문제에 오류가 있을 때 바꿀 문제가 필요해요',
    c.rules.revivalEnabled && count('REVIVAL') === 0 && '패자부활을 쓰는데 패자부활 문제가 없어요',
  ].filter(Boolean) as string[];

  // 화면 번호: 예선·본선·결승만 셈
  let n = 0;
  const label = (it: Item) => (it.round === 'REVIVAL' ? '부활' : it.round === 'SPARE' ? '예비' : String(++n));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/contests/${c.id}/lineup`, {
        method: 'PUT',
        body: { items: items.map((i) => ({ questionId: i.questionId, round: i.round, timeLimitSec: i.timeLimitSec })) },
      });
      setNotice('편성을 저장했어요');
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장하지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`grid gap-6 ${editable ? 'xl:grid-cols-[420px_minmax(0,1fr)]' : ''}`}>
      {editable && (
        <section className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-20 xl:self-start">
          <div className="card p-5">
            <h2 className="text-[1.0625rem] font-bold">승인된 문제</h2>
            <p className="mt-1 text-sm text-grey-700">고른 라운드로 편성 끝에 넣어요. 순서는 오른쪽에서 끌어서 바꿔요.</p>
            <div className="mt-4 flex flex-col gap-2">
              <Segmented label="넣을 라운드" value={addRound} onChange={setAddRound} options={ROUNDS.map((r) => ({ value: r, label: ROUND_LABEL[r] }))} />
              <input className="field min-h-11" placeholder="문제·선생님 이름으로 찾기" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="문제 찾기" />
              <div className="flex gap-2">
                <select className="field min-h-10 flex-1 py-0 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="과목">
                  <option value="">모든 과목</option>
                  <SubjectOptions />
                </select>
                <select className="field min-h-10 flex-1 py-0 text-sm" value={type} onChange={(e) => setType(e.target.value as QuestionType | '')} aria-label="유형">
                  <option value="">모든 유형</option>
                  {(['OX', 'CHOICE', 'SHORT', 'INITIAL', 'NUMBER', 'ORDER'] as QuestionType[]).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="card max-h-[calc(100dvh-420px)] min-h-[240px] overflow-auto">
            {!bank ? (
              <p className="flex items-center justify-center gap-2 py-10 font-semibold text-grey-700">
                <Spinner className="text-school" /> 불러오는 중
              </p>
            ) : bankShown.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm font-semibold text-grey-700">{bank.length === 0 ? '아직 승인된 문제가 없어요' : '넣을 수 있는 문제가 없어요'}</p>
            ) : (
              <ul className="divide-y divide-grey-100">
                {bankShown.map((q) => (
                  <li key={q.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-grey-700">
                        <span className="text-grey-900">{TYPE_LABEL[q.type]}</span> · {q.subject} · {DIFFICULTY_LABEL[q.difficulty]} · {q.authorName}
                      </p>
                      <p className="mt-0.5 line-clamp-2 font-semibold">{q.body}</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-tint shrink-0"
                      onClick={() => change([...items, { questionId: q.id, round: addRound, timeLimitSec: null, q, body: q.body }])}
                    >
                      넣기
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section className="flex min-w-0 flex-col gap-3">
        <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
          <div>
            <p className="num text-[1.375rem] font-bold">
              {play.length}문제 · 약 {minutes}분
            </p>
            <p className="mt-0.5 text-sm text-grey-700">문제마다 제한시간 + 진행 여유 {PAD_SEC}초로 셈 (예비 제외)</p>
            {editable && (
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-grey-700">
                <span className="num rounded-[8px] bg-grey-100 px-2 py-0.5 font-semibold text-grey-900">15초</span> 유형 기본 시간
                <span className="num ml-2 rounded-[8px] bg-school-50 px-2 py-0.5 font-semibold text-school-deep">20초</span> 이 대회에서 바꾼 시간 · 칸을 비우면 기본으로
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ROUNDS.map((r) => (
              <span key={r} className={`num rounded-full px-3 py-1 text-sm font-semibold ${ROUND_TONE[r]}`}>
                {ROUND_LABEL[r]} {count(r)}
              </span>
            ))}
            {typeCounts.map(([t, k]) => (
              <span key={t} className="num rounded-full bg-white px-3 py-1 text-sm font-semibold text-grey-700 shadow-[inset_0_0_0_1px_var(--color-grey-200)]">
                {t} {k}
              </span>
            ))}
          </div>
          {editable && (
            <div className="ml-auto flex gap-2">
              <button type="button" className="btn" disabled={items.length < 2} onClick={() => change(autoArrange(items))}>
                자동 정렬
              </button>
              <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={() => void save()}>
                {busy ? <Spinner /> : dirty ? '편성 저장' : '저장됨'}
              </button>
            </div>
          )}
        </div>

        {!editable && (
          <p className="rounded-[14px] bg-school-50 px-5 py-3.5 font-semibold text-grey-900">
            {c.status === 'LOCKED' ? '잠긴 편성이에요. 고치려면 위에서 [잠금 풀기]를 눌러 주세요.' : '시작한 대회라 편성을 바꿀 수 없어요.'}
          </p>
        )}
        {(warnings.length > 0 || error) && (
          <ul className="flex flex-col gap-1.5">
            {error && <li className="rounded-[14px] bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-deep">{error}</li>}
            {warnings.map((w) => (
              <li key={w} className="rounded-[14px] bg-amber-50 px-4 py-2.5 text-sm font-semibold text-grey-900">
                {w}
              </li>
            ))}
          </ul>
        )}

        <div className="card overflow-hidden">
          {items.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-lg font-bold">아직 편성한 문제가 없어요</p>
              <p className="mt-1.5 text-grey-700">왼쪽에서 승인된 문제를 넣어 주세요. 부록 B처럼 예선 OX → 본선 → 패자부활 → 결승 → 예비 순서를 권해요.</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={items.map((i) => i.questionId)} strategy={verticalListSortingStrategy}>
                <ol className="divide-y divide-grey-100">
                  {items.map((it) => (
                    <Row
                      key={it.questionId}
                      it={it}
                      label={label(it)}
                      editable={editable}
                      onRound={(r) => change(items.map((x) => (x.questionId === it.questionId ? { ...x, round: r } : x)))}
                      onTime={(t) => change(items.map((x) => (x.questionId === it.questionId ? { ...x, timeLimitSec: t } : x)))}
                      onRemove={() => change(items.filter((x) => x.questionId !== it.questionId))}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </section>
    </div>
  );
}

function Row({
  it,
  label,
  editable,
  onRound,
  onTime,
  onRemove,
}: {
  it: Item;
  label: string;
  editable: boolean;
  onRound: (r: Round) => void;
  onTime: (t: number | null) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: it.questionId, disabled: !editable });
  const def = it.q.timeLimitSec ?? (it.round === 'FINAL' ? FINAL_TIME_SEC : DEFAULT_TIME_SEC[it.q.type]);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex items-center gap-3 bg-white px-4 py-3 sm:px-5 ${isDragging ? 'relative z-10 shadow-[var(--shadow-pop)]' : ''}`}
    >
      {editable && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`${it.body} 순서 옮기기`}
          className="grid h-10 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-[8px] text-grey-400 hover:bg-grey-100 hover:text-grey-700 active:cursor-grabbing"
        >
          <svg width="12" height="18" viewBox="0 0 12 18" aria-hidden="true">
            {[3, 9, 15].map((y) => (
              <g key={y} fill="currentColor">
                <circle cx="3" cy={y} r="1.6" />
                <circle cx="9" cy={y} r="1.6" />
              </g>
            ))}
          </svg>
        </button>
      )}
      <span className={`num grid h-9 min-w-9 shrink-0 place-items-center rounded-[10px] px-1.5 text-sm font-bold ${ROUND_TONE[it.round]}`}>{label}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-grey-700">
          <span className="text-grey-900">{TYPE_LABEL[it.q.type]}</span> · {it.q.subject} · {DIFFICULTY_LABEL[it.q.difficulty]}
          <span className="hidden md:inline"> · 정답 {answerSummary(it.q.config)}</span>
        </p>
        <p className="mt-0.5 line-clamp-1 font-semibold">{it.body}</p>
      </div>
      {editable ? (
        <>
          <select className="field min-h-10 w-[104px] shrink-0 py-0 text-sm" value={it.round} onChange={(e) => onRound(e.target.value as Round)} aria-label="라운드">
            {ROUNDS.map((r) => (
              <option key={r} value={r}>
                {ROUND_LABEL[r]}
              </option>
            ))}
          </select>
          <TimeCell value={it.timeLimitSec} def={def} onChange={onTime} />
          <button type="button" onClick={onRemove} aria-label="편성에서 빼기" className="grid h-10 w-9 shrink-0 place-items-center rounded-[10px] text-grey-500 hover:bg-grey-100 hover:text-grey-900">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </>
      ) : (
        <span className={`num shrink-0 rounded-[8px] px-2 py-0.5 text-sm font-semibold ${it.timeLimitSec !== null && it.timeLimitSec !== def ? 'bg-school-50 text-school-deep' : 'text-grey-900'}`}>{it.timeLimitSec ?? def}초</span>
      )}
    </li>
  );
}

/** 실제로 쓰일 초를 늘 보여 줌. 기본값과 같으면 null(기본)로 저장, 바꾼 값만 파랗게 */
function TimeCell({ value, def, onChange }: { value: number | null; def: number; onChange: (t: number | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const custom = value !== null && value !== def;
  const commit = (raw: string) => {
    const n = raw ? Math.max(1, Math.min(120, Number(raw))) : null;
    const next = n === null || n === def ? null : n;
    if (next !== value) onChange(next);
  };
  return (
    <label className="relative hidden shrink-0 sm:block">
      <input
        className={`field num min-h-10 w-[84px] py-0 pr-7 text-sm ${custom ? 'bg-school-50 text-school-deep' : 'text-grey-900'}`}
        inputMode="numeric"
        value={draft ?? String(value ?? def)}
        onFocus={(e) => {
          setDraft(String(value ?? def));
          e.currentTarget.select();
        }}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 3);
          setDraft(v);
          if (v) commit(v);
        }}
        onBlur={() => {
          if (draft === '') commit('');
          setDraft(null);
        }}
        aria-label={`제한시간 (초), 기본 ${def}초`}
      />
      <span className={`pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold ${custom ? 'text-school-deep' : 'text-grey-500'}`}>초</span>
    </label>
  );
}
