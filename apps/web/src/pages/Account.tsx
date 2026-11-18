import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api, ApiError } from '../lib/api.ts';
import { homeFor, useMe } from '../lib/useMe.ts';
import { Logo, Spinner } from '../components/ui.tsx';

// 비밀번호 바꾸기 (첫 로그인 때는 여기서 시작, 5.1)
export default function Account() {
  const me = useMe();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError('새 비밀번호는 8자 이상이어야 해요');
    if (next !== again) return setError('새 비밀번호 두 칸이 서로 달라요');
    setBusy(true);
    try {
      await api('/api/auth/password', { method: 'PATCH', body: { current, next } });
      setDone(true);
      const to = params.get('next');
      setTimeout(() => navigate(to && to.startsWith('/') && !to.startsWith('//') ? to : homeFor(me!), { replace: true }), 900);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '서버에 연결하지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  if (!me) {
    return (
      <main className="flex min-h-dvh items-center justify-center gap-2 font-semibold text-grey-700">
        <Spinner className="text-school" /> 불러오는 중
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <Logo size={48} />
      <h1 className="display mt-5 text-[1.75rem] leading-snug">
        {me.mustChangePw ? (
          <>
            {me.name} 선생님,
            <br />
            비밀번호를 바꿔 주세요
          </>
        ) : (
          '비밀번호 바꾸기'
        )}
      </h1>
      <p className="mt-2 text-grey-700">
        {me.mustChangePw ? '처음 받은 비밀번호로 로그인했어요. 나만 아는 비밀번호로 바꾼 뒤에 쓸 수 있어요.' : '바꾸면 다른 기기에서는 로그아웃돼요.'}
      </p>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-grey-700">지금 비밀번호</span>
          <input className="field bg-white" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-grey-700">새 비밀번호 · 8자 이상</span>
          <input className="field bg-white" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-grey-700">새 비밀번호 한 번 더</span>
          <input className="field bg-white" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="rounded-[14px] bg-red-50 px-4 py-3 text-[0.9375rem] font-semibold text-red-deep">
            {error}
          </p>
        )}
        {done && <p className="rounded-[14px] bg-green-50 px-4 py-3 text-[0.9375rem] font-semibold text-green">바꿨어요. 잠시 뒤 이동해요</p>}
        <button type="submit" className="btn btn-primary btn-lg mt-2" disabled={busy || done || !current || !next || !again}>
          {busy ? <Spinner /> : '비밀번호 바꾸기'}
        </button>
      </form>
    </main>
  );
}
