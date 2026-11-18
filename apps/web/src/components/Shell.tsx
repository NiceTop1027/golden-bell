import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { api, type Me } from '../lib/api.ts';
import { Logo, Spinner } from './ui.tsx';

// 선생님·관리자 메뉴는 같고, 관리자만 [선생님](계정 관리)이 더 있음
const STAFF_LINKS = [
  { to: '/admin', label: '대회' },
  { to: '/admin/review', label: '문제 검수' },
  { to: '/teacher/questions', label: '내 문제' },
  { to: '/admin/subjects', label: '과목' },
];
const LINKS: Record<Me['role'], { to: string; label: string }[]> = {
  ADMIN: [...STAFF_LINKS, { to: '/admin/teachers', label: '선생님' }],
  TEACHER: [...STAFF_LINKS, { to: '/admin/teachers', label: '선생님' }],
};

/** 선생님·관리자 화면 공용 틀: 위 메뉴 + 가운데 본문 */
export function Shell({ me, children, wide = false }: { me: Me | null; children: ReactNode; wide?: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-grey-200 bg-white">
        {/* 폰: 1줄 로고·계정, 2줄 메뉴 (메뉴가 4–5개라 한 줄에 다 안 들어감). sm부터 한 줄 */}
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-2 px-4 sm:h-14 sm:flex-nowrap sm:gap-4 sm:px-6">
          <NavLink to={me ? '/admin' : '/'} className="flex h-14 shrink-0 items-center gap-2 font-bold sm:h-auto">
            <Logo size={32} />
            <span>덕영 골든벨</span>
          </NavLink>
          {me && (
          <nav className="order-last -mx-1 flex min-w-0 basis-full gap-1 overflow-x-auto px-1 pb-2 sm:order-none sm:flex-1 sm:basis-auto sm:pb-0" aria-label="메뉴">
            {LINKS[me.role].map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end
                  className={({ isActive }) =>
                    `shrink-0 rounded-[10px] px-3 py-2 text-[0.9375rem] font-semibold transition-colors ${isActive ? 'bg-grey-100 text-grey-900' : 'text-grey-600 hover:bg-grey-50 hover:text-grey-900'}`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
          </nav>
          )}
          {me && (
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0">
              <NavLink to="/account/password" className="hidden rounded-[10px] px-3 py-2 text-sm font-semibold text-grey-700 hover:bg-grey-50 md:block">
                {me.name}
              </NavLink>
              <NavLink to="/account/password" aria-label={`${me.name} · 비밀번호 바꾸기`} className="grid h-10 w-10 place-items-center rounded-[10px] text-grey-700 hover:bg-grey-50 md:hidden">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="8.5" r="3.5" />
                  <path d="M5 20c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5" />
                </svg>
              </NavLink>
              <button
                type="button"
                className="rounded-[10px] px-3 py-2 text-sm font-semibold text-grey-700 hover:bg-grey-50"
                onClick={() => void api('/api/auth/logout', { method: 'POST', body: {} }).then(() => navigate('/login'))}
              >
                로그아웃
              </button>
            </div>
          )}
        </div>
      </header>
      {me ? (
        <main className={`mx-auto px-4 pt-6 pb-24 sm:px-6 sm:pt-8 ${wide ? 'max-w-[1440px]' : 'max-w-5xl'}`}>{children}</main>
      ) : (
        <main className="flex min-h-[60dvh] items-center justify-center gap-3 font-semibold text-grey-700">
          <Spinner className="text-school" /> 불러오는 중
        </main>
      )}
    </div>
  );
}

/** 페이지 제목 줄 */
export function PageHead({ title, desc, action }: { title: string; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-[1.75rem] leading-tight">{title}</h1>
        {desc && <p className="mt-1.5 text-[0.9375rem] text-grey-700">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

/** 회색 바탕 위 탭형 필터 (선택은 흰 알약) */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  size?: 'md' | 'lg';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-[14px] bg-grey-200/70 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`num shrink-0 rounded-[10px] font-semibold transition-[background-color,color] duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${size === 'lg' ? 'min-h-11 px-4 text-[0.9375rem]' : 'min-h-9 px-3 text-sm'} ${
            value === o.value ? 'bg-white text-grey-900' : 'text-grey-600 hover:text-grey-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
