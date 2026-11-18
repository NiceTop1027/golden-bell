import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { JoinAck } from '@gb/shared/types';
import { api, ApiError } from '../lib/api.ts';
import { emitAck, getSocket } from '../lib/socket.ts';
import { findSessionByCode, lastJoin, saveSession } from '../lib/session.ts';
import { Logo, Spinner } from '../components/ui.tsx';

// SC-16 참가: 코드·학번·이름 → 대기실 (5.7)
export default function Join() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const last = lastJoin();
  const [code, setCode] = useState(params.get('code') ?? last?.code ?? '');
  const [studentNo, setStudentNo] = useState(last?.studentNo ?? '');
  const [name, setName] = useState(last?.name ?? '');
  const [title, setTitle] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setTitle(null);
    setCodeError(null);
    if (!/^\d{6}$/.test(code)) return;
    let alive = true;
    api<{ title: string }>(`/api/join/${code}`)
      .then((r) => alive && setTitle(r.title))
      .catch((e) =>
        alive &&
        setCodeError(
          e instanceof ApiError && e.status === 429 ? e.message : '이 코드로 열린 대회가 없어요. 무대 화면의 코드를 다시 확인해 주세요.',
        ),
      );
    return () => {
      alive = false;
    };
  }, [code]);

  async function join(token?: string) {
    const s = getSocket();
    const r = await emitAck<JoinAck>((cb) =>
      s.emit('player:join', { code, studentNo: studentNo.trim(), name: name.trim(), token }, cb),
    );
    if (r.ok) {
      saveSession({ contestId: r.contestId, code, studentNo: studentNo.trim(), name: name.trim(), token: r.token });
      navigate(`/play/${r.contestId}`);
      return;
    }
    if (r.error === 'DEVICE_CHANGE_PENDING') {
      setPending(true);
      s.once('device:approved', ({ token: t }) => {
        setPending(false);
        void join(t);
      });
      s.once('device:rejected', () => {
        setPending(false);
        setError('진행자가 기기 변경을 거절했어요. 원래 쓰던 기기로 참가해 주세요.');
      });
      return;
    }
    setError(r.message ?? '참가하지 못했어요. 입력한 내용을 확인해 주세요.');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError('대회 코드는 숫자 6자리예요.');
    if (!/^\d{4,6}$/.test(studentNo.trim())) return setError('학번은 숫자로 입력해 주세요. 예: 20315 (2학년 3반 15번)');
    if (!name.trim()) return setError('이름을 입력해 주세요.');
    setBusy(true);
    try {
      await join(findSessionByCode(code, studentNo.trim())?.token);
    } catch {
      setError('서버에 연결하지 못했어요. 와이파이를 확인하고 다시 눌러 주세요.');
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-5 text-center">
        <Spinner className="h-8 w-8 text-school" />
        <div>
          <h1 className="text-2xl font-bold">진행자 승인을 기다리고 있어요</h1>
          <p className="mt-2 leading-relaxed text-grey-700">
            {studentNo} 학번이 다른 기기에서 이미 참가해 있어요.
            <br />
            진행자가 승인하면 이 기기로 옮겨져요.
          </p>
        </div>
      </main>
    );
  }

  const ready = /^\d{6}$/.test(code) && !!title && studentNo.trim().length >= 4 && name.trim().length > 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <Logo size={48} />
      <h1 className="display mt-5 text-[1.75rem] leading-snug">
        덕영 골든벨에
        <br />
        참가할게요
      </h1>
      {title ? (
        <p className="mt-2 font-semibold text-school-deep">{title}</p>
      ) : (
        <p className="mt-2 text-grey-700">무대 화면의 코드와 학번, 이름을 입력해 주세요.</p>
      )}

      <form onSubmit={onSubmit} className="mt-8 flex flex-1 flex-col gap-5" noValidate>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-grey-700">대회 코드</span>
          <input
            className="field num text-[1.375rem] tracking-[0.25em]"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            placeholder="6자리 숫자"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            aria-invalid={codeError ? true : undefined}
          />
          {codeError && <span className="text-sm font-semibold text-red">{codeError}</span>}
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-grey-700">학번</span>
          <input
            className="field num text-[1.125rem]"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            placeholder="예: 20315 (2학년 3반 15번)"
            value={studentNo}
            onChange={(e) => setStudentNo(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-grey-700">이름</span>
          <input
            className="field text-[1.125rem]"
            autoComplete="name"
            maxLength={20}
            placeholder="홍길동"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {error && (
          <p role="alert" className="rounded-[14px] bg-red-50 px-4 py-3 text-[0.9375rem] font-semibold text-red-deep">
            {error}
          </p>
        )}

        <div className="mt-auto pt-6">
          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy || !ready}>
            {busy ? <Spinner /> : '참가하기'}
          </button>
          <p className="mt-3 text-center text-[0.8125rem] text-grey-700">무대 화면의 QR을 찍으면 코드가 자동으로 들어가요.</p>
        </div>
      </form>
    </main>
  );
}
