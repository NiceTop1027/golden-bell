import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { DEFAULT_RULES, type Rules } from '@gb/shared/types';
import { api, ApiError } from '../../../lib/api.ts';
import { Segmented } from '../../../components/Shell.tsx';
import { ConfirmDialog, Spinner } from '../../../components/ui.tsx';
import { type ContestCtx, stageUrl } from '../Contest.tsx';

type Opt<T extends string> = { value: T; label: string };
const yn = (on: string, off: string): Opt<'y' | 'n'>[] => [
  { value: 'y', label: on },
  { value: 'n', label: off },
];

export default function Settings({ c, reload, setNotice, setDirty }: ContestCtx) {
  const navigate = useNavigate();
  const started = c.started;
  const [title, setTitle] = useState(c.title);
  const [heldOn, setHeldOn] = useState(c.heldOn);
  const [rules, setRules] = useState<Rules>({ ...DEFAULT_RULES, ...c.rules });
  const [useRoster, setUseRoster] = useState(c.useRoster);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const [askKey, setAskKey] = useState(false);
  const [askReset, setAskReset] = useState(false);

  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => setRules((r) => ({ ...r, [k]: v }));
  const dirtyInfo = title !== c.title || heldOn !== c.heldOn;
  const dirtyRules = JSON.stringify(rules) !== JSON.stringify({ ...DEFAULT_RULES, ...c.rules }) || useRoster !== c.useRoster;
  const dirty = dirtyInfo || dirtyRules;
  useEffect(() => {
    setDirty('settings', dirty);
  }, [dirty, setDirty]);
  useEffect(() => () => setDirty('settings', false), [setDirty]);

  const revert = () => {
    setTitle(c.title);
    setHeldOn(c.heldOn);
    setRules({ ...DEFAULT_RULES, ...c.rules });
    setUseRoster(c.useRoster);
    setError(null);
  };
  const saveAll = () =>
    run(
      'save',
      async () => {
        if (dirtyInfo || dirtyRules) {
          await api(`/api/contests/${c.id}`, {
            method: 'PATCH',
            body: { ...(dirtyInfo ? { title: title.trim(), heldOn } : {}), ...(dirtyRules ? { rules, useRoster } : {}) },
          });
        }
      },
      '설정을 저장했어요',
    );

  async function run(kind: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      setNotice(ok);
      await reload();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '처리하지 못했어요';
      if (kind === 'save') setError(msg);
      else setNotice(msg);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] ${dirty ? 'pb-28' : ''}`}>
      <div className="flex min-w-0 flex-col gap-5">
        <Card title="기본 정보">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <Field label="대회 이름">
              <input className="field" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="날짜">
              <input className="field num" type="date" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title="참가 코드와 무대 링크">
          <dl className="grid grid-cols-1 gap-4 text-[0.9375rem]">
            <div>
              <dt className="text-sm font-semibold text-grey-700">참가 코드</dt>
              <dd className="num mt-1 text-[1.5rem] font-extrabold tracking-[0.12em] text-school-deep">{c.joinCode}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-grey-700">무대 화면 링크 · 링크를 아는 사람은 누구나 무대 화면을 볼 수 있어요</dt>
              <dd className="mt-1.5 flex items-center gap-2">
                <code className="num min-w-0 flex-1 truncate rounded-[10px] bg-grey-100 px-3 py-2.5 text-sm">{stageUrl(c)}</code>
                <button type="button" className="btn btn-sm shrink-0" onClick={() => setAskKey(true)}>
                  링크 다시 만들기
                </button>
              </dd>
            </div>
          </dl>
        </Card>


        {c.status !== 'DRAFT' && (
          <Card title="리허설 기록 지우기" desc="리허설로 쌓인 참가자·제출·진행 상태를 지우고 잠긴 상태로 돌려요. 실제 대회가 끝난 뒤에는 쓰지 마세요.">
            <button type="button" className="btn btn-danger" disabled={busy !== null || c.participants === 0} onClick={() => setAskReset(true)}>
              리허설 기록 지우기
            </button>
            {c.participants === 0 && <p className="mt-2 text-sm font-semibold text-grey-700">지울 참가 기록이 없어요.</p>}
          </Card>
        )}

        <Card title="대회 지우기" desc="참가자가 들어온 적 없는 대회만 지울 수 있어요. 문제 은행의 문제는 남아요.">
          <button type="button" className="btn btn-danger" disabled={busy !== null || started || c.participants > 0} onClick={() => setAskDelete(true)}>
            이 대회 지우기
          </button>
          {(started || c.participants > 0) && (
            <p className="mt-2 text-sm font-semibold text-grey-700">
              {c.status !== 'DRAFT' ? '참가 기록이 있어 지울 수 없어요. 리허설이었다면 위에서 기록을 먼저 지워 주세요.' : '참가 기록이 있어 지울 수 없어요.'}
            </p>
          )}
        </Card>
      </div>

      <Card
        title="규칙"
        desc={started ? '시작한 대회라 규칙을 바꿀 수 없어요.' : '바꾼 규칙은 저장하면 바로 적용돼요. 대회 중에는 바꿀 수 없어요.'}
      >
        <fieldset disabled={started} className="flex flex-col divide-y divide-grey-100">
          <Rule
            label="참가 명단 사용"
            hint={
              useRoster && c.rosterCount === 0 ? (
                <span className="font-semibold text-red-deep">
                  명단이 비어 있어 아무도 못 들어와요.{' '}
                  <Link to={`/admin/contests/${c.id}/roster`} className="underline underline-offset-4">
                    명단 올리기
                  </Link>
                </span>
              ) : useRoster ? (
                `명단 ${c.rosterCount}명의 학번·이름만 들어와요`
              ) : (
                '켜면 명단에 있는 학번·이름만 들어와요'
              )
            }
          >
            <Segmented label="참가 명단 사용" value={useRoster ? 'y' : 'n'} onChange={(v) => setUseRoster(v === 'y')} options={yn('사용', '안 함')} />
          </Rule>
          <Rule label="늦은 참가">
            <Segmented label="늦은 참가" value={rules.lateJoin} onChange={(v) => set('lateJoin', v)} options={[{ value: 'BEFORE_START', label: '시작 후 불가' }, { value: 'ALWAYS', label: '계속 허용' }]} />
          </Rule>
          <Rule label="타이머 시작" hint={rules.timerStart === 'AUTO' ? `문제가 뜨고 ${rules.readSec}초 뒤 자동으로 시작` : '사회자가 읽은 뒤 [타이머 시작]'}>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented label="타이머 시작" value={rules.timerStart} onChange={(v) => set('timerStart', v)} options={[{ value: 'HOST', label: '진행자가' }, { value: 'AUTO', label: '자동' }]} />
              {rules.timerStart === 'AUTO' && (
                <NumberBox label="읽기 시간" value={rules.readSec} min={0} max={15} unit="초" onChange={(v) => set('readSec', v)} />
              )}
            </div>
          </Rule>
          <Rule label="0초가 되면">
            <Segmented label="0초가 되면" value={rules.autoClose ? 'y' : 'n'} onChange={(v) => set('autoClose', v === 'y')} options={yn('자동 마감', '진행자가 마감')} />
          </Rule>
          <Rule label="마감 전 답 바꾸기">
            <Segmented label="마감 전 답 바꾸기" value={rules.allowEdit ? 'y' : 'n'} onChange={(v) => set('allowEdit', v === 'y')} options={yn('허용', '안 함')} />
          </Rule>
          <Rule label="전원 탈락이면">
            <Segmented label="전원 탈락이면" value={rules.allEliminated} onChange={(v) => set('allEliminated', v)} options={[{ value: 'ASK', label: '진행자에게 묻기' }, { value: 'AUTO_VOID', label: '자동으로 무효' }]} />
          </Rule>
          <Rule label="패자부활">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented label="패자부활" value={rules.revivalEnabled ? 'y' : 'n'} onChange={(v) => set('revivalEnabled', v === 'y')} options={yn('사용', '안 함')} />
              {rules.revivalEnabled && (
                <Segmented
                  label="패자부활 횟수"
                  value={String(rules.revivalMaxCount) as '1' | '2' | '3'}
                  onChange={(v) => set('revivalMaxCount', Number(v))}
                  options={[{ value: '1', label: '1회' }, { value: '2', label: '2회' }, { value: '3', label: '3회' }]}
                />
              )}
            </div>
          </Rule>
          {rules.revivalEnabled && (
            <Rule label="부활 최대 인원" hint="정하면 빨리 맞힌 순서로 부활해요">
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  label="부활 최대 인원"
                  value={rules.revivalMaxPeople === null ? 'all' : 'n'}
                  onChange={(v) => set('revivalMaxPeople', v === 'all' ? null : (rules.revivalMaxPeople ?? 10))}
                  options={[{ value: 'all', label: '제한 없음' }, { value: 'n', label: '인원 정하기' }]}
                />
                {rules.revivalMaxPeople !== null && <NumberBox label="부활 최대 인원" value={rules.revivalMaxPeople} min={1} max={999} unit="명" onChange={(v) => set('revivalMaxPeople', v)} />}
              </div>
            </Rule>
          )}
          <Rule label="생존자 1명이 되면">
            <Segmented label="생존자 1명이 되면" value={rules.oneLeft} onChange={(v) => set('oneLeft', v)} options={[{ value: 'SUGGEST_FINAL', label: '골든벨 문제로 이동 제안' }, { value: 'CONTINUE', label: '계속 진행' }]} />
          </Rule>
          <Rule label="문제를 다 쓰면" hint="생존자가 여러 명일 때">
            <Segmented label="문제를 다 쓰면" value={rules.exhausted} onChange={(v) => set('exhausted', v)} options={[{ value: 'CO_WIN', label: '공동 우승' }, { value: 'SUDDEN_DEATH', label: '예비 문제로 서든데스' }]} />
          </Rule>
          <Rule label="객관식 보기 섞기" hint="켜면 학생마다 순서가 다르고, 무대는 번호 없이 보여요">
            <Segmented label="객관식 보기 섞기" value={rules.shuffleChoices ? 'y' : 'n'} onChange={(v) => set('shuffleChoices', v === 'y')} options={yn('켬', '끔')} />
          </Rule>
          <Rule label="무대에 제출 수">
            <Segmented label="무대에 제출 수" value={rules.showSubmitCount ? 'y' : 'n'} onChange={(v) => set('showSubmitCount', v === 'y')} options={yn('표시', '숨김')} />
          </Rule>
          <Rule label="무대에 생존자 이름" hint="이 인원 이하일 때만 이름을 보여요">
            <NumberBox label="생존자 이름 표시 인원" value={rules.showAliveNamesAtMost} min={0} max={50} unit="명 이하" onChange={(v) => set('showAliveNamesAtMost', v)} />
          </Rule>
          <Rule label="많이 나온 오답" hint="단답 정답 공개 때 이름 없이">
            <Segmented label="많이 나온 오답" value={rules.showWrongTop ? 'y' : 'n'} onChange={(v) => set('showWrongTop', v === 'y')} options={yn('표시', '숨김')} />
          </Rule>
          <Rule label="화면 이탈 표시" hint="진행자 참고용, 자동 탈락 아님">
            <Segmented label="화면 이탈 표시" value={rules.showVisibility ? 'y' : 'n'} onChange={(v) => set('showVisibility', v === 'y')} options={yn('켬', '끔')} />
          </Rule>
        </fieldset>
      </Card>

      {dirty && (
        <div className="enter fixed inset-x-0 bottom-0 z-20 border-t border-grey-200 bg-white" role="region" aria-label="설정 저장">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-4 py-3.5 sm:px-6">
            <p className={`min-w-0 flex-1 font-semibold ${error ? 'text-red-deep' : 'text-grey-900'}`}>{error ?? '저장하지 않은 설정이 있어요'}</p>
            <button type="button" className="btn" disabled={busy !== null} onClick={revert}>
              되돌리기
            </button>
            <button type="button" className="btn btn-primary min-w-28" disabled={busy !== null || !title.trim()} onClick={() => void saveAll()}>
              {busy === 'save' ? <Spinner /> : '저장'}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={askKey}
        title="무대 링크를 다시 만들까요?"
        onClose={() => setAskKey(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setAskKey(false)}>
              취소
            </button>
            <button type="button" className="btn btn-primary" onClick={() => (setAskKey(false), void run('key', () => api(`/api/contests/${c.id}/stage-key`, { method: 'POST', body: {} }), '새 무대 링크를 만들었어요'))}>
              다시 만들기
            </button>
          </>
        }
      >
        지금 링크로 열린 무대 화면은 다시 연결할 때 들어오지 못해요. 링크가 밖으로 퍼졌을 때 써요.
      </ConfirmDialog>
      <ConfirmDialog
        open={askReset}
        title="리허설 기록을 지울까요?"
        onClose={() => setAskReset(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setAskReset(false)}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => (setAskReset(false), void run('reset', () => api(`/api/contests/${c.id}/reset`, { method: 'POST', body: {} }), '리허설 기록을 지웠어요. 다시 시작할 수 있어요'))}
            >
              지우고 처음으로
            </button>
          </>
        }
      >
        {c.title}의 참가자 {c.participants}명과 제출·진행 상태를 모두 지우고 시작 전으로 돌려요. 되돌릴 수 없어요.
      </ConfirmDialog>
      <ConfirmDialog
        open={askDelete}
        title={`${c.title}을 지울까요?`}
        onClose={() => setAskDelete(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setAskDelete(false)}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() =>
                void api(`/api/contests/${c.id}`, { method: 'DELETE' })
                  .then(() => navigate('/admin', { replace: true }))
                  .catch((e) => (setAskDelete(false), setNotice(e instanceof ApiError ? e.message : '지우지 못했어요')))
              }
            >
              지우기
            </button>
          </>
        }
      >
        편성과 명단이 함께 지워져요. 되돌릴 수 없어요.
      </ConfirmDialog>
    </div>
  );
}

function Card({ title, desc, aside, children }: { title: string; desc?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-semibold text-grey-700">{label}</span>
      {children}
    </label>
  );
}

function Rule({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        {hint && <p className="text-sm text-grey-700">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function NumberBox({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <span className="inline-flex items-center gap-2">
      <input
        className="field num min-h-10 w-20 py-0 text-center"
        inputMode="numeric"
        aria-label={label}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, '') || min);
          onChange(Math.max(min, Math.min(max, n)));
        }}
      />
      <span className="text-sm font-semibold text-grey-700">{unit}</span>
    </span>
  );
}
