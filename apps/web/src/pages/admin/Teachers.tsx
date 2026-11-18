import { useEffect, useMemo, useState } from 'react';
import type { TeacherDTO } from '@gb/shared/types';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/useMe.ts';
import { PageHead, Shell } from '../../components/Shell.tsx';
import { ConfirmDialog, Spinner } from '../../components/ui.tsx';

type Created = { name: string; loginId: string; initialPassword: string };

/** "이름, 아이디, 과목" 한 줄에 한 명 */
function parseLines(text: string) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name = '', loginId = '', subject = ''] = l.split(/[,\t]/).map((x) => x.trim());
      return { name, loginId: loginId.toLowerCase(), subject: subject || undefined };
    });
}

// SC-06 선생님 계정 관리
export default function Teachers() {
  const me = useMe();
  const [rows, setRows] = useState<TeacherDTO[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created[] | null>(null);
  const [resetFor, setResetFor] = useState<TeacherDTO | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => api<TeacherDTO[]>('/api/admin/teachers').then(setRows);
  useEffect(() => {
    if (me) void load();
  }, [me]);

  const parsed = useMemo(() => parseLines(text), [text]);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ created: Created[] }>('/api/admin/teachers', { body: { teachers: parsed } });
      setAddOpen(false);
      setText('');
      setCreated(r.created);
      setCopied(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '계정을 만들지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  async function patch(t: TeacherDTO, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await api<{ initialPassword?: string }>(`/api/admin/teachers/${t.id}`, { method: 'PATCH', body });
      if (r.initialPassword) {
        setCreated([{ name: t.name, loginId: t.loginId, initialPassword: r.initialPassword }]);
        setCopied(false);
      }
      await load();
    } finally {
      setBusy(false);
      setResetFor(null);
    }
  }

  const copyAll = async () => {
    const lines = (created ?? []).map((c) => `${c.name}\t${c.loginId}\t${c.initialPassword}`).join('\n');
    try {
      await navigator.clipboard.writeText(`이름\t아이디\t처음 비밀번호\n${lines}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Shell me={me}>
      <PageHead
        title="선생님 계정"
        desc="계정을 만들면 처음 비밀번호가 한 번만 보여요. 선생님은 첫 로그인 때 비밀번호를 바꿔요."
        action={
          <button type="button" className="btn btn-primary" onClick={() => (setError(null), setAddOpen(true))}>
            선생님 추가
          </button>
        }
      />
      <section className="card overflow-hidden">
        {!rows ? (
          <p className="flex items-center justify-center gap-2 px-6 py-12 font-semibold text-grey-700">
            <Spinner className="text-school" /> 불러오는 중
          </p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-12 text-center font-semibold text-grey-700">아직 선생님 계정이 없어요</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[0.9375rem]">
              <thead className="text-left text-sm text-grey-600">
                <tr className="border-b border-grey-100">
                  <th className="px-6 py-3 font-semibold">이름</th>
                  <th className="px-3 py-3 font-semibold">아이디</th>
                  <th className="px-3 py-3 font-semibold">과목</th>
                  <th className="px-3 py-3 text-right font-semibold">문제</th>
                  <th className="px-3 py-3 font-semibold">상태</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className={`border-b border-grey-100 last:border-0 ${t.isActive ? '' : 'text-grey-500'}`}>
                    <td className="px-6 py-3 font-semibold">{t.name}</td>
                    <td className="num px-3 py-3">{t.loginId}</td>
                    <td className="px-3 py-3">{t.subject ?? '—'}</td>
                    <td className="num px-3 py-3 text-right">{t.questionCount}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`chip text-sm ${!t.isActive ? 'bg-grey-100 text-grey-600' : t.mustChangePw ? 'bg-amber-50 text-grey-900' : 'bg-green-50 text-green'}`}
                      >
                        {!t.isActive ? '쓰지 않음' : t.mustChangePw ? '첫 로그인 전' : '사용 중'}
                      </span>
                    </td>
                    <td className="px-6 py-2 text-right whitespace-nowrap">
                      {t.isActive && (
                        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setResetFor(t)}>
                          비밀번호 초기화
                        </button>
                      )}
                      <button
                        type="button"
                        className={`btn btn-sm ml-1.5 bg-transparent ${t.isActive ? 'text-red hover:bg-red-50' : 'text-school-deep hover:bg-school-50'}`}
                        disabled={busy}
                        onClick={() => void patch(t, { isActive: !t.isActive })}
                      >
                        {t.isActive ? '쓰지 않기' : '다시 쓰기'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="mt-3 text-sm text-grey-700">쓰지 않는 계정은 로그인만 막고, 그 선생님이 낸 문제는 그대로 남아요.</p>

      <ConfirmDialog
        open={addOpen}
        title="선생님 추가"
        onClose={() => setAddOpen(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setAddOpen(false)}>
              취소
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || parsed.length === 0} onClick={() => void add()}>
              {busy ? <Spinner /> : `${parsed.length}명 만들기`}
            </button>
          </>
        }
      >
        <p>한 줄에 한 명씩 "이름, 아이디, 과목"으로 적어 주세요. 엑셀에서 세 칸을 복사해 붙여도 돼요.</p>
        <textarea
          className="field mt-3 min-h-36 py-3 font-medium text-grey-900"
          value={text}
          placeholder={'김민지, minji.kim, 국어\n박준호, junho.park, 과학'}
          onChange={(e) => setText(e.target.value)}
          aria-label="추가할 선생님"
        />
        {error && <p className="mt-2 text-sm font-semibold text-red">{error}</p>}
      </ConfirmDialog>

      <ConfirmDialog
        open={resetFor !== null}
        title={`${resetFor?.name ?? ''} 선생님 비밀번호를 초기화할까요?`}
        onClose={() => setResetFor(null)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setResetFor(null)}>
              취소
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => resetFor && void patch(resetFor, { resetPassword: true })}>
              초기화
            </button>
          </>
        }
      >
        새 처음 비밀번호를 만들고, 지금 로그인된 기기에서는 로그아웃돼요.
      </ConfirmDialog>

      <ConfirmDialog
        open={created !== null}
        title="처음 비밀번호"
        onClose={() => setCreated(null)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => void copyAll()}>
              {copied ? '복사했어요' : '모두 복사'}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setCreated(null)}>
              전달했어요
            </button>
          </>
        }
      >
        <p className="font-semibold text-red-deep">이 창을 닫으면 다시 볼 수 없어요. 선생님께 따로 전달해 주세요.</p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {(created ?? []).map((c) => (
            <li key={c.loginId} className="flex items-center justify-between gap-3 rounded-[12px] bg-grey-100 px-4 py-2.5 text-grey-900">
              <span className="font-semibold">
                {c.name} <span className="num font-medium text-grey-700">{c.loginId}</span>
              </span>
              <span className="num font-bold tracking-wide">{c.initialPassword}</span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </Shell>
  );
}
