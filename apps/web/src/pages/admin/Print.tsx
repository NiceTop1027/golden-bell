import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { type ContestDetailDTO, type QuestionConfig, ROUND_LABEL, TYPE_LABEL } from '@gb/shared/types';
import { api } from '../../lib/api.ts';
import { answerSummary } from '../../lib/answer.ts';
import { useMe } from '../../lib/useMe.ts';
import { Spinner } from '../../components/ui.tsx';

// SC-12 인쇄용 문제지: 서버가 멈췄을 때 화이트보드로 진행하는 비상용 (C-06)
export default function Print() {
  const me = useMe();
  const { id = '' } = useParams();
  const [c, setC] = useState<ContestDetailDTO | null>(null);
  useEffect(() => {
    if (me) void api<ContestDetailDTO>(`/api/contests/${id}`).then(setC);
  }, [me, id]);

  if (!c) {
    return (
      <main className="flex min-h-dvh items-center justify-center gap-2 font-semibold text-grey-700">
        <Spinner className="text-school" /> 불러오는 중
      </main>
    );
  }

  let n = 0;
  const rows = c.lineup.map((l) => {
    const body = l.locked?.body ?? l.question.body;
    const cfg: QuestionConfig = l.locked?.config ?? l.question.config;
    const no = l.round === 'REVIVAL' || l.round === 'SPARE' ? ROUND_LABEL[l.round] : String(++n);
    return { no, round: l.round, body, cfg, explanation: l.locked?.explanation ?? l.question.explanation, time: l.locked?.timeLimitSec ?? l.timeLimitSec ?? l.question.timeLimitSec };
  });

  return (
    <main className="mx-auto max-w-[820px] bg-white px-10 py-10 text-grey-900 print:max-w-none print:px-0 print:py-0">
      <style>{'@page { size: A4; margin: 16mm; } @media print { body { background: #fff !important; } }'}</style>
      <div className="mb-8 flex items-start justify-between gap-4 print:hidden">
        <p className="text-sm text-grey-700">
          브라우저 인쇄(Ctrl+P)에서 "PDF로 저장"을 고르면 파일로 남길 수 있어요.
          {c.status === 'DRAFT' && ' 아직 편성을 잠그지 않아서, 잠근 뒤 내용과 다를 수 있어요.'}
        </p>
        <button type="button" className="btn btn-primary shrink-0" onClick={() => window.print()}>
          인쇄하기
        </button>
      </div>

      <h1 className="text-[1.75rem] font-extrabold">{c.title} · 문제지</h1>
      <p className="num mt-1 text-sm text-grey-700">
        {c.heldOn} · 참가 코드 {c.joinCode} · {rows.length}문제 · 진행자용 (정답은 마지막 장)
      </p>

      <ol className="mt-6 flex flex-col">
        {rows.map((r, i) => (
          <li key={i} className="break-inside-avoid border-t border-grey-200 py-4">
            <p className="text-sm font-bold text-grey-700">
              {r.no === ROUND_LABEL[r.round] ? r.no : `${r.no}번 · ${ROUND_LABEL[r.round]}`} · {TYPE_LABEL[r.cfg.type]}
              {r.time ? ` · ${r.time}초` : ''}
            </p>
            <p className="mt-1 text-[1.25rem] leading-snug font-bold">{r.body}</p>
            {r.cfg.type === 'OX' && <p className="mt-2 text-[1.0625rem]">O 맞다 / X 틀리다</p>}
            {r.cfg.type === 'CHOICE' && (
              <ol className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[1.0625rem]">
                {r.cfg.choices.map((ch, j) => (
                  <li key={j}>
                    {j + 1}. {ch}
                  </li>
                ))}
              </ol>
            )}
            {r.cfg.type === 'INITIAL' && <p className="mt-2 text-[1.0625rem] tracking-[0.2em]">초성: {r.cfg.hint}</p>}
            {r.cfg.type === 'NUMBER' && r.cfg.unit && <p className="mt-2 text-[1.0625rem]">숫자로 답하기 · 단위 {r.cfg.unit}</p>}
            {r.cfg.type === 'ORDER' && <p className="mt-2 text-[1.0625rem]">순서대로 놓기: {[...r.cfg.items].reverse().map((x) => x.text).join(' / ')}</p>}
          </li>
        ))}
      </ol>

      <section className="mt-10 break-before-page">
        <h2 className="text-[1.375rem] font-extrabold">정답표</h2>
        <table className="mt-4 w-full text-[0.9375rem]">
          <thead className="text-left text-sm text-grey-700">
            <tr className="border-b border-grey-300">
              <th className="py-2 pr-3 font-semibold">번호</th>
              <th className="py-2 pr-3 font-semibold">정답</th>
              <th className="py-2 font-semibold">해설</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="break-inside-avoid border-b border-grey-200 align-top">
                <td className="num py-2 pr-3 font-bold whitespace-nowrap">{r.no}</td>
                <td className="py-2 pr-3 font-semibold">{answerSummary(r.cfg)}</td>
                <td className="py-2 text-grey-800">{r.explanation ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
