import { useEffect, useState } from 'react';
import type { SubjectDTO } from '@gb/shared/types';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/useMe.ts';
import { groupSubjects, loadSubjects } from '../../lib/subjects.ts';
import { PageHead, Shell } from '../../components/Shell.tsx';
import { ConfirmDialog, Spinner } from '../../components/ui.tsx';

const NEW_GROUP = '__new__';
type Edit = { mode: 'add' | 'edit'; id?: string; name: string; group: string; newGroup: string; questionCount: number; original?: string };

// 과목 관리: 선생님·관리자 누구나. 이름을 바꾸면 그 과목의 문제도 함께 바뀜
export default function Subjects() {
  const me = useMe();
  const [rows, setRows] = useState<SubjectDTO[] | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [groupEdit, setGroupEdit] = useState<{ from: string; to: string } | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    const list = await loadSubjects(true);
    setRows(list);
  };
  useEffect(() => {
    if (me) void load().catch(() => setError('과목을 불러오지 못했어요'));
  }, [me]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const groups = groupSubjects(rows ?? []);
  const groupNames = groups.map((g) => g.label);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      setNotice(ok);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '처리하지 못했어요');
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** 같은 묶음 안에서 한 칸 위·아래로 */
  async function move(s: SubjectDTO, dir: -1 | 1) {
    if (!rows) return;
    const g = rows.filter((x) => x.group === s.group);
    const i = g.findIndex((x) => x.id === s.id);
    const j = i + dir;
    if (j < 0 || j >= g.length) return;
    const ids = rows.map((x) => x.id);
    const a = ids.indexOf(g[i]!.id);
    const b = ids.indexOf(g[j]!.id);
    [ids[a], ids[b]] = [ids[b]!, ids[a]!];
    // 화면 먼저 바꾸고 서버에 저장
    setRows(ids.map((id) => rows.find((x) => x.id === id)!));
    try {
      setRows(await api<SubjectDTO[]>('/api/subjects/order', { method: 'PUT', body: { ids } }));
      void loadSubjects(true);
    } catch {
      setError('순서를 저장하지 못했어요');
      void load();
    }
  }

  const openAdd = (group?: string) =>
    setEdit({ mode: 'add', name: '', group: group ?? groupNames[0] ?? NEW_GROUP, newGroup: '', questionCount: 0 });
  const openEdit = (s: SubjectDTO) =>
    setEdit({ mode: 'edit', id: s.id, name: s.name, group: s.group, newGroup: '', questionCount: s.questionCount, original: s.name });

  async function saveEdit() {
    if (!edit) return;
    const group = edit.group === NEW_GROUP ? edit.newGroup.trim() : edit.group;
    const body = { name: edit.name.trim(), group };
    const ok =
      edit.mode === 'add'
        ? await run(() => api('/api/subjects', { body }), `"${body.name}" 과목을 추가했어요`)
        : await run(
            () => api(`/api/subjects/${edit.id}`, { method: 'PATCH', body }),
            edit.original !== body.name && edit.questionCount > 0 ? `이름을 바꾸고 ${edit.questionCount}문제의 과목도 함께 바꿨어요` : '과목을 고쳤어요',
          );
    if (ok) setEdit(null);
  }

  const editGroup = edit ? (edit.group === NEW_GROUP ? edit.newGroup.trim() : edit.group) : '';
  const editValid = !!edit && edit.name.trim().length > 0 && editGroup.length > 0;

  return (
    <Shell me={me}>
      <PageHead
        title="과목"
        desc="선생님이 문제를 쓸 때 고르는 과목이에요. 이름을 바꾸면 그 과목을 쓰는 문제도 함께 바뀌어요."
        action={
          <button type="button" className="btn btn-primary" disabled={!rows} onClick={() => openAdd()}>
            과목 추가
          </button>
        }
      />
      {error && !edit && <p className="mb-4 rounded-[14px] bg-red-50 px-5 py-3.5 font-semibold text-red-deep">{error}</p>}
      {!rows ? (
        <p className="flex items-center gap-2 font-semibold text-grey-700">
          <Spinner className="text-school" /> 불러오는 중
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <section key={g.label} className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-grey-100 px-5 py-4 sm:px-6">
                <h2 className="text-[1.0625rem] font-bold">{g.label}</h2>
                <span className="num text-sm font-semibold text-grey-600">{g.items.length}개</span>
                <div className="ml-auto flex gap-2">
                  <button type="button" className="btn btn-sm" onClick={() => setGroupEdit({ from: g.label, to: g.label })}>
                    묶음 이름 바꾸기
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => openAdd(g.label)}>
                    여기에 추가
                  </button>
                </div>
              </div>
              <ul className="divide-y divide-grey-100">
                {g.items.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
                    <div className="flex shrink-0 flex-col">
                      <MoveButton label={`${s.name} 위로`} dir="up" disabled={busy || i === 0} onClick={() => void move(s, -1)} />
                      <MoveButton label={`${s.name} 아래로`} dir="down" disabled={busy || i === g.items.length - 1} onClick={() => void move(s, 1)} />
                    </div>
                    <p className="min-w-0 flex-1 truncate font-semibold">{s.name}</p>
                    <span className={`num shrink-0 text-sm font-semibold ${s.questionCount ? 'text-grey-700' : 'text-grey-500'}`}>
                      {s.questionCount ? `${s.questionCount}문제` : '문제 없음'}
                    </span>
                    <button type="button" className="btn btn-sm ml-2 shrink-0" onClick={() => openEdit(s)}>
                      고치기
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* 과목 추가·고치기 */}
      <ConfirmDialog
        open={edit !== null}
        title={edit?.mode === 'add' ? '과목 추가' : '과목 고치기'}
        onClose={() => (setEdit(null), setError(null))}
        actions={
          <>
            <button type="button" className="btn" onClick={() => (setEdit(null), setError(null))}>
              취소
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || !editValid} onClick={() => void saveEdit()}>
              {busy ? <Spinner /> : edit?.mode === 'add' ? '추가' : '저장'}
            </button>
          </>
        }
      >
        {edit && (
          <div className="mt-2 flex flex-col gap-3 text-grey-900">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-grey-700">과목 이름</span>
              <input className="field" maxLength={20} value={edit.name} placeholder="예: 모의해킹" onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-grey-700">묶음</span>
              <select className="field" value={edit.group} onChange={(e) => setEdit({ ...edit, group: e.target.value })}>
                {groupNames.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
                <option value={NEW_GROUP}>새 묶음 만들기…</option>
              </select>
            </label>
            {edit.group === NEW_GROUP && (
              <input className="field" maxLength={20} value={edit.newGroup} placeholder="새 묶음 이름 (예: 전공 실무)" aria-label="새 묶음 이름" onChange={(e) => setEdit({ ...edit, newGroup: e.target.value })} />
            )}
            {edit.mode === 'edit' && edit.original !== edit.name.trim() && edit.questionCount > 0 && (
              <p className="rounded-[12px] bg-school-50 px-3 py-2 text-sm font-semibold text-school-deep">
                이 과목을 쓰는 {edit.questionCount}문제의 과목도 "{edit.name.trim() || '…'}"로 함께 바뀌어요.
              </p>
            )}
            {error && <p className="text-sm font-semibold text-red">{error}</p>}
            {edit.mode === 'edit' && (
              <div className="mt-2 border-t border-grey-100 pt-3">
                {edit.questionCount > 0 ? (
                  <p className="text-sm text-grey-700">{edit.questionCount}문제가 쓰고 있어 지울 수 없어요. 문제의 과목을 먼저 바꿔 주세요.</p>
                ) : (
                  <button type="button" className="text-sm font-bold text-red underline-offset-4 hover:underline" onClick={() => setAskDelete(true)}>
                    이 과목 지우기
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={askDelete}
        title={`"${edit?.original ?? ''}" 과목을 지울까요?`}
        onClose={() => setAskDelete(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setAskDelete(false)}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={async () => {
                const e = edit;
                setAskDelete(false);
                if (!e?.id) return;
                if (await run(() => api(`/api/subjects/${e.id}`, { method: 'DELETE' }), `"${e.original}" 과목을 지웠어요`)) setEdit(null);
              }}
            >
              지우기
            </button>
          </>
        }
      >
        목록에서 빠져서 선생님이 더 이상 고를 수 없어요. 쓰는 문제가 없어서 다른 데이터는 바뀌지 않아요.
      </ConfirmDialog>

      {/* 묶음 이름 바꾸기 */}
      <ConfirmDialog
        open={groupEdit !== null}
        title="묶음 이름 바꾸기"
        onClose={() => (setGroupEdit(null), setError(null))}
        actions={
          <>
            <button type="button" className="btn" onClick={() => (setGroupEdit(null), setError(null))}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !groupEdit?.to.trim()}
              onClick={async () => {
                const g = groupEdit;
                if (!g) return;
                if (await run(() => api('/api/subjects/group', { method: 'PUT', body: { from: g.from, to: g.to.trim() } }), '묶음 이름을 바꿨어요')) setGroupEdit(null);
              }}
            >
              {busy ? <Spinner /> : '저장'}
            </button>
          </>
        }
      >
        {groupEdit && (
          <div className="mt-2 flex flex-col gap-2 text-grey-900">
            <input className="field" maxLength={20} value={groupEdit.to} aria-label="묶음 이름" onChange={(e) => setGroupEdit({ ...groupEdit, to: e.target.value })} />
            <p className="text-sm text-grey-700">다른 묶음과 같은 이름으로 바꾸면 두 묶음이 합쳐져요.</p>
            {error && <p className="text-sm font-semibold text-red">{error}</p>}
          </div>
        )}
      </ConfirmDialog>

      {notice && (
        <div role="status" className="enter fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
          <div className="rounded-[16px] bg-grey-900/90 px-6 py-3.5 font-semibold text-white">{notice}</div>
        </div>
      )}
    </Shell>
  );
}

function MoveButton({ label, dir, disabled, onClick }: { label: string; dir: 'up' | 'down'; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-7 w-9 place-items-center rounded-[8px] text-grey-500 hover:bg-grey-100 hover:text-grey-900 disabled:pointer-events-none disabled:text-grey-300"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d={dir === 'up' ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
