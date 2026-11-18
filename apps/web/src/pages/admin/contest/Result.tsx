import { useEffect, useState } from 'react';
import { ROUND_LABEL, type ResultDTO, TYPE_LABEL } from '@gb/shared/types';
import { api } from '../../../lib/api.ts';
import { Segmented } from '../../../components/Shell.tsx';
import { Spinner } from '../../../components/ui.tsx';
import type { ContestCtx } from '../Contest.tsx';

type Tab = 'ranking' | 'questions' | 'logs';

export default function Result({ c }: ContestCtx) {
  const [r, setR] = useState<ResultDTO | null>(null);
  const [tab, setTab] = useState<Tab>('ranking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ResultDTO>(`/api/contests/${c.id}/result`)
      .then(setR)
      .catch(() => setError('결과를 불러오지 못했어요'));
  }, [c.id, c.status, c.participants]);

  if (error) return <p className="card px-6 py-12 text-center font-semibold text-red">{error}</p>;
  if (!r)
    return (
      <p className="flex items-center gap-2 py-12 font-semibold text-grey-700">
        <Spinner className="text-school" /> 불러오는 중
      </p>
    );

  const winners = r.ranking.filter((x) => x.rank === 1);
  const asked = r.questions.filter((q) => q.asked && !q.voided);

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-wrap items-center gap-x-8 gap-y-4 p-5 sm:p-6">
        <Stat k="참가" v={`${r.ranking.length}명`} />
        <Stat k="낸 문제" v={`${asked.length}문제`} />
        <Stat k={c.status === 'FINISHED' ? '우승' : '지금 1위'} v={winners.length ? winners.map((w) => w.name).join(', ') : '—'} />
        <div className="ml-auto flex flex-wrap gap-2">
          {(
            [
              ['ranking', '순위'],
              ['records', '학생별 기록'],
              ['questions', '문제별 통계'],
              ['alive', '생존자 명단'],
            ] as const
          ).map(([k, label]) => (
            <a key={k} className="btn btn-sm" href={`/api/contests/${c.id}/export/${k}.csv`}>
              {label} CSV
            </a>
          ))}
        </div>
      </section>

      {r.ranking.length === 0 ? (
        <section className="card px-6 py-14 text-center">
          <p className="text-lg font-bold">아직 참가한 학생이 없어요</p>
          <p className="mt-1.5 text-grey-700">대회를 진행하면 순위와 문제별 통계가 여기에 쌓여요.</p>
        </section>
      ) : (
        <>
          <Segmented
            label="결과 보기"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'ranking', label: '순위' },
              { value: 'questions', label: '문제별 통계' },
              { value: 'logs', label: `진행 기록 ${r.logs.length}` },
            ]}
          />
          {tab === 'ranking' && (
            <section className="card overflow-x-auto">
              <table className="w-full min-w-[620px] text-[0.9375rem]">
                <thead className="text-left text-sm text-grey-600">
                  <tr className="border-b border-grey-100">
                    <th className="px-6 py-3 font-semibold">순위</th>
                    <th className="px-3 py-3 font-semibold">학번</th>
                    <th className="px-3 py-3 font-semibold">이름</th>
                    <th className="px-3 py-3 font-semibold">결과</th>
                    <th className="px-3 py-3 text-right font-semibold">맞힘 / 낸 답</th>
                    <th className="px-6 py-3 text-right font-semibold">부활</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {r.ranking.map((x) => (
                    <tr key={x.studentNo} className="border-b border-grey-100 last:border-0">
                      <td className="px-6 py-2.5 font-extrabold">{x.rank}</td>
                      <td className="px-3 py-2.5">{x.studentNo}</td>
                      <td className="px-3 py-2.5 font-semibold">{x.name}</td>
                      <td className="px-3 py-2.5">
                        {x.status === 'ALIVE' ? (
                          <span className="chip bg-green-50 text-sm text-green">{c.status === 'FINISHED' ? '우승' : '생존'}</span>
                        ) : (
                          <span className="text-grey-700">{x.eliminatedAtIndex ? `${x.eliminatedAtIndex}번에서 탈락` : '탈락'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {x.correctCount} / {x.answeredCount}
                      </td>
                      <td className="px-6 py-2.5 text-right">{x.revivedCount || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {tab === 'questions' && (
            <section className="card overflow-x-auto">
              <table className="w-full min-w-[760px] text-[0.9375rem]">
                <thead className="text-left text-sm text-grey-600">
                  <tr className="border-b border-grey-100">
                    <th className="px-6 py-3 font-semibold">번호</th>
                    <th className="px-3 py-3 font-semibold">문제</th>
                    <th className="px-3 py-3 font-semibold">정답률</th>
                    <th className="px-3 py-3 text-right font-semibold">평균 응답</th>
                    <th className="px-6 py-3 font-semibold">고른 답</th>
                  </tr>
                </thead>
                <tbody>
                  {r.questions.map((q) => {
                    const rate = q.targets ? Math.round((q.correct / q.targets) * 100) : null;
                    return (
                      <tr key={q.cqId} className={`border-b border-grey-100 align-top last:border-0 ${!q.asked || q.voided ? 'text-grey-500' : ''}`}>
                        <td className="num px-6 py-3 font-bold">{q.index ?? ROUND_LABEL[q.round]}</td>
                        <td className="max-w-[360px] px-3 py-3">
                          <p className="text-sm font-semibold text-grey-700">
                            {TYPE_LABEL[q.type]} · 정답 {q.answerText}
                            {q.voided && ' · 무효'}
                            {!q.asked && ' · 내지 않음'}
                          </p>
                          <p className="mt-0.5 font-semibold">{q.body}</p>
                        </td>
                        <td className="px-3 py-3">
                          {q.asked && !q.voided && rate !== null ? (
                            <div className="flex w-36 items-center gap-2">
                              <div className="h-2 flex-1 rounded-full bg-grey-100">
                                <div className="h-full rounded-full bg-green" style={{ width: `${rate}%` }} />
                              </div>
                              <span className="num w-20 text-right text-sm font-semibold">
                                {rate}% <span className="text-grey-500">{q.correct}/{q.targets}</span>
                              </span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="num px-3 py-3 text-right">{q.avgResponseMs !== null ? `${(q.avgResponseMs / 1000).toFixed(1)}초` : '—'}</td>
                        <td className="px-6 py-3 text-sm text-grey-800">
                          {q.choiceCounts ? q.choiceCounts.map((n, i) => `${i + 1}번 ${n}`).join(' · ') : q.wrongTop.length ? `많이 나온 오답: ${q.wrongTop.map((w) => `${w.answer} ${w.count}`).join(', ')}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
          {tab === 'logs' && (
            <section className="card max-h-[600px] overflow-auto">
              <ol className="divide-y divide-grey-100">
                {r.logs.map((l, i) => (
                  <li key={i} className="flex gap-4 px-6 py-2.5 text-[0.9375rem]">
                    <span className="num w-20 shrink-0 text-grey-600">{new Date(l.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    <span className="min-w-0 flex-1 font-semibold">{l.log}</span>
                    <span className="shrink-0 text-sm text-grey-600">{l.actor ?? ''}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-grey-700">{k}</p>
      <p className="num mt-0.5 text-[1.375rem] font-bold">{v}</p>
    </div>
  );
}
