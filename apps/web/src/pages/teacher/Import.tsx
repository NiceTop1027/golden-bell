import { useRef, useState } from 'react';
import { Link } from 'react-router';
import type { QuestionInput } from '@gb/shared/schemas';
import { TYPE_LABEL } from '@gb/shared/types';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/useMe.ts';
import { PageHead, Shell } from '../../components/Shell.tsx';
import { Spinner } from '../../components/ui.tsx';

type Row = { row: number; ok: boolean; errors: string[]; data: QuestionInput | null; preview: string };

// SC-04 엑셀 일괄 업로드 (Q-05)
export default function Import() {
  const me = useMe();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState<'check' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  async function check(f: File) {
    setBusy('check');
    setError(null);
    setSaved(null);
    setRows(null);
    setFileName(f.name);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/questions/import', { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '검사하지 못했어요');
      setRows(data.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : '검사하지 못했어요');
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const items = (rows ?? []).filter((r) => r.ok && r.data).map((r) => r.data!);
    setBusy('save');
    setError(null);
    try {
      const r = await api<{ created: number }>('/api/questions/import/commit', { body: { items } });
      setSaved(r.created);
      setRows(null);
      setFileName(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장하지 못했어요');
    } finally {
      setBusy(null);
    }
  }

  const ok = rows?.filter((r) => r.ok).length ?? 0;
  const bad = rows?.filter((r) => !r.ok).length ?? 0;

  return (
    <Shell me={me}>
      <PageHead
        title="엑셀로 올리기"
        desc="여러 문제를 한 번에 올려요. 엑셀(.xlsx)·CSV 모두 되고(맥·윈도우 상관없이), 검사를 통과한 줄만 작성중으로 저장돼요. 이미지는 저장한 뒤 문제마다 붙여요."
        action={
          <Link to="/teacher/questions" className="btn bg-white">
            내 문제로
          </Link>
        }
      />
      <ol className="grid gap-4 md:grid-cols-2">
        <li className="card p-6">
          <p className="text-[1.0625rem] font-bold">1. 템플릿 받기</p>
          <p className="mt-1 text-[0.9375rem] text-grey-700">예시 다섯 줄과 작성 방법이 들어 있어요. 예시 줄은 지우고 써 주세요.</p>
          <a className="btn btn-tint mt-4" href="/api/questions/template.xlsx">
            템플릿 받기 (.xlsx)
          </a>
        </li>
        <li className="card p-6">
          <p className="text-[1.0625rem] font-bold">2. 다 쓴 파일 올리기</p>
          <p className="mt-1 text-[0.9375rem] text-grey-700">올리면 바로 줄마다 검사해요. 아직 저장되지는 않아요.</p>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void check(f);
              e.target.value = '';
            }}
          />
          <button type="button" className={`btn mt-4 ${fileName ? '' : 'btn-primary'}`} disabled={busy !== null} onClick={() => input.current?.click()}>
            {busy === 'check' ? <Spinner /> : fileName ? '다른 파일 고르기' : '파일 고르기'}
          </button>
        </li>
      </ol>

      {error && <p className="mt-5 rounded-[14px] bg-red-50 px-5 py-3.5 font-semibold text-red-deep">{error}</p>}
      {saved !== null && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[14px] bg-green-50 px-5 py-4">
          <p className="min-w-0 flex-1 font-semibold">{saved}문제를 작성중으로 저장했어요. 확인한 뒤에 하나씩 제출해 주세요.</p>
          <Link to="/teacher/questions" className="btn btn-sm bg-white">
            내 문제 보기
          </Link>
        </div>
      )}

      {rows && (
        <section className="card mt-5 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-grey-100 p-5">
            <p className="num min-w-0 flex-1 font-bold">
              {fileName} · 통과 <span className="text-green">{ok}</span> · 오류 <span className={bad ? 'text-red' : ''}>{bad}</span>
            </p>
            <button type="button" className="btn btn-primary" disabled={ok === 0 || busy !== null} onClick={() => void save()}>
              {busy === 'save' ? <Spinner /> : `통과한 ${ok}문제 저장`}
            </button>
          </div>
          {rows.length === 0 ? (
            <p className="px-6 py-10 text-center font-semibold text-grey-700">읽을 줄이 없어요. 둘째 줄부터 문제를 써 주세요.</p>
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full text-[0.9375rem]">
                <thead className="sticky top-0 bg-white text-left text-sm text-grey-600">
                  <tr>
                    <th className="px-5 py-2 font-semibold">줄</th>
                    <th className="px-3 py-2 font-semibold">검사</th>
                    <th className="px-5 py-2 font-semibold">문제</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.row} className="border-t border-grey-100 align-top">
                      <td className="num px-5 py-3 font-semibold">{r.row}</td>
                      <td className="px-3 py-3">
                        <span className={`chip text-sm ${r.ok ? 'bg-green-50 text-green' : 'bg-red-50 text-red-deep'}`}>{r.ok ? '통과' : '오류'}</span>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-semibold">
                          {r.data ? <span className="mr-1.5 text-sm text-grey-700">{TYPE_LABEL[r.data.config.type]} · {r.data.subject}</span> : null}
                          {r.preview || '(문제 없음)'}
                        </p>
                        {r.errors.map((e) => (
                          <p key={e} className="mt-1 text-sm font-semibold text-red-deep">
                            {r.row}행: {e}
                          </p>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </Shell>
  );
}
