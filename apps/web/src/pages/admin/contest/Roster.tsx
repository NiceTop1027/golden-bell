import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { RosterEntryDTO } from '@gb/shared/types';
import { api, ApiError } from '../../../lib/api.ts';
import { Spinner } from '../../../components/ui.tsx';
import type { ContestCtx } from '../Contest.tsx';

type Parsed = { entries: RosterEntryDTO[]; bad: { line: number; text: string }[] };

/** "학번, 이름, 반" 한 줄에 한 명. 첫 줄이 제목이면 건너뜀. 쉼표·탭 모두 */
function parse(text: string): Parsed {
  const entries: RosterEntryDTO[] = [];
  const bad: Parsed['bad'] = [];
  text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = raw.trim();
      if (!line) return;
      const [no = '', name = '', cls = ''] = line.split(/[,\t]/).map((x) => x.trim().replace(/^"|"$/g, ''));
      if (i === 0 && !/^\d/.test(no)) return; // 제목 줄
      if (!/^\d{4,6}$/.test(no) || !name) bad.push({ line: i + 1, text: line });
      else entries.push({ studentNo: no, name, className: cls || null });
    });
  return { entries, bad };
}

export default function Roster({ c, reload, setNotice, setDirty }: ContestCtx) {
  const [rows, setRows] = useState<RosterEntryDTO[] | null>(null);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const editable = !c.started;

  const load = () => api<RosterEntryDTO[]>(`/api/contests/${c.id}/roster`).then(setRows);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id]);

  const parsed = useMemo(() => parse(text), [text]);
  const hasDraft = text.trim().length > 0;
  useEffect(() => {
    setDirty('roster', hasDraft);
  }, [hasDraft, setDirty]);
  useEffect(() => () => setDirty('roster', false), [setDirty]);
  const shown = (rows ?? []).filter((r) => !search.trim() || r.studentNo.includes(search.trim()) || r.name.includes(search.trim()));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ count: number; duplicates: number }>(`/api/contests/${c.id}/roster`, {
        method: 'PUT',
        body: { entries: parsed.entries.map((e) => ({ studentNo: e.studentNo, name: e.name, className: e.className ?? undefined })) },
      });
      setNotice(`명단 ${r.count}명을 저장했어요${r.duplicates ? ` (같은 학번 ${r.duplicates}줄은 마지막 줄로)` : ''}`);
      setText('');
      await Promise.all([load(), reload()]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장하지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="card p-5 sm:p-6">
        <h2 className="text-[1.0625rem] font-bold">명단 올리기</h2>
        <p className="mt-1 text-sm text-grey-700">
          한 줄에 한 명씩 "학번, 이름, 반"으로 붙여 넣거나 CSV 파일을 골라요. 올리면 지금 명단을 통째로 바꿔요.
        </p>
        {!c.useRoster && (
          <p className="mt-3 rounded-[14px] bg-amber-50 px-4 py-3 text-sm font-semibold text-grey-900">
            지금은 명단을 쓰지 않아요. 명단에 있는 학생만 받으려면{' '}
            <Link to={`/admin/contests/${c.id}/settings`} className="text-school-deep underline underline-offset-4">
              설정
            </Link>
            에서 "참가 명단 사용"을 켜 주세요.
          </p>
        )}
        <textarea
          className="field mt-4 min-h-48 py-3 font-medium"
          value={text}
          disabled={!editable}
          placeholder={'학번,이름,반\n20315,김하늘,2-3\n20316,이서연,2-3'}
          onChange={(e) => setText(e.target.value)}
          aria-label="명단 붙여 넣기"
        />
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setText(await f.text());
            e.target.value = '';
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-sm" disabled={!editable} onClick={() => file.current?.click()}>
            CSV 파일 고르기
          </button>
          <p className="num min-w-0 flex-1 text-sm font-semibold text-grey-700">
            {text.trim() ? `${parsed.entries.length}명 읽음${parsed.bad.length ? ` · 읽지 못한 줄 ${parsed.bad.length}개` : ''}` : ''}
          </p>
          <button type="button" className="btn btn-primary" disabled={!editable || busy || parsed.entries.length === 0} onClick={() => void save()}>
            {busy ? <Spinner /> : `${parsed.entries.length}명으로 바꾸기`}
          </button>
        </div>
        {parsed.bad.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 rounded-[14px] bg-red-50 px-4 py-3 text-sm text-red-deep">
            {parsed.bad.slice(0, 5).map((b) => (
              <li key={b.line}>
                <span className="font-bold">{b.line}번째 줄</span> "{b.text}" · 학번은 숫자 4–6자리, 이름은 꼭 있어야 해요
              </li>
            ))}
            {parsed.bad.length > 5 && <li>그 밖에 {parsed.bad.length - 5}줄 더</li>}
          </ul>
        )}
        {error && <p className="mt-3 text-sm font-semibold text-red">{error}</p>}
        {!editable && <p className="mt-3 text-sm font-semibold text-grey-700">시작한 대회라 명단을 바꿀 수 없어요.</p>}
      </section>

      <section className="card flex min-h-[320px] flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-grey-100 p-5">
          <h2 className="num text-[1.0625rem] font-bold">지금 명단 {rows ? `${rows.length}명` : ''}</h2>
          <input className="field ml-auto min-h-10 w-48 py-0 text-sm" placeholder="학번·이름 찾기" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="명단 찾기" />
        </div>
        {!rows ? (
          <p className="flex items-center justify-center gap-2 py-12 font-semibold text-grey-700">
            <Spinner className="text-school" /> 불러오는 중
          </p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-12 text-center font-semibold text-grey-700">아직 올린 명단이 없어요</p>
        ) : (
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-[0.9375rem]">
              <thead className="sticky top-0 bg-white text-left text-sm text-grey-600">
                <tr>
                  <th className="px-5 py-2 font-semibold">학번</th>
                  <th className="px-3 py-2 font-semibold">이름</th>
                  <th className="px-5 py-2 font-semibold">반</th>
                </tr>
              </thead>
              <tbody className="num">
                {shown.map((r) => (
                  <tr key={r.studentNo} className="border-t border-grey-100">
                    <td className="px-5 py-2 font-semibold">{r.studentNo}</td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-5 py-2 text-grey-700">{r.className ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
