import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api, ApiError, type Me } from './api.ts';

/** 로그인한 선생님 누구나 대회·문제·검수·과목·계정 권한이 같음 */
export const hasStaffPower = (me: Pick<Me, 'role'> | null | undefined) => me?.role === 'ADMIN' || me?.role === 'TEACHER';
export const homeFor = (_me: Pick<Me, 'role'>) => '/admin';

/** 로그인한 선생님·관리자만. 첫 로그인이면 비밀번호 변경 화면으로 (5.1) */
export function useMe(role?: 'ADMIN') {
  const navigate = useNavigate();
  const loc = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let alive = true;
    const here = loc.pathname + loc.search;
    api<Me>('/api/auth/me')
      .then((m) => {
        if (!alive) return;
        if (m.mustChangePw && loc.pathname !== '/account/password') return navigate(`/account/password?next=${encodeURIComponent(here)}`, { replace: true });
        if (role === 'ADMIN' && m.role !== 'ADMIN') return navigate(homeFor(m), { replace: true });
        setMe(m);
      })
      .catch((e) => {
        if (alive && e instanceof ApiError && e.status === 401) navigate(`/login?next=${encodeURIComponent(here)}`, { replace: true });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);
  return me;
}
