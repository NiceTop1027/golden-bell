import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api, ApiError, type Me } from '../lib/api.ts';
import { homeFor } from '../lib/useMe.ts';
import { Logo, Spinner } from '../components/ui.tsx';

// SC-01 로그인 (관리자·선생님)
export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await api<Me>('/api/auth/login', { body: { loginId: loginId.trim(), password } });
      const next = params.get('next');
      const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
      if (me.mustChangePw) navigate(`/account/password${safe ? `?next=${encodeURIComponent(safe)}` : ''}`, { replace: true });
      else navigate(safe ?? homeFor(me), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '서버에 연결하지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <Logo size={48} />
      <h1 className="display mt-5 text-[1.75rem] leading-snug">
        선생님
        <br />
        로그인
      </h1>
      <p className="mt-2 text-grey-700">덕영 골든벨 출제와 진행을 위한 계정이에요.</p>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-grey-700">아이디</span>
          <input className="field bg-white" autoComplete="username" value={loginId} onChange={(e) => setLoginId(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-grey-700">비밀번호</span>
          <input className="field bg-white" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="rounded-[14px] bg-red-50 px-4 py-3 text-[0.9375rem] font-semibold text-red-deep">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-lg mt-2" disabled={busy || !loginId || !password}>
          {busy ? <Spinner /> : '로그인'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-grey-700">
        학생은 로그인하지 않아요.{' '}
        <a className="font-semibold text-school-deep underline underline-offset-4" href="/join">
          참가 화면으로
        </a>
      </p>
    </main>
  );
}
