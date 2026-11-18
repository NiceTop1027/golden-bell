import { type ComponentType, StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import './styles.css';
import Join from './pages/Join.tsx';

/**
 * 새로 배포하면 파일 이름이 바뀌어, 미리 열어 둔 화면은 예전 파일을 찾다가 실패한다.
 * 그때는 한 번만 새로고침해서 새 화면을 받는다 (10초 안에 또 실패하면 그대로 오류).
 */
function page<T extends { default: ComponentType }>(load: () => Promise<T>) {
  return lazy(() =>
    load().catch((err: unknown) => {
      const key = 'gb-reloaded-at';
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(key) ?? 0);
        if (Date.now() - last > 10_000) sessionStorage.setItem(key, String(Date.now()));
      } catch {
        /* 저장소를 못 쓰면 그냥 한 번 새로고침 */
      }
      if (Date.now() - last > 10_000) {
        window.location.reload();
        return new Promise<T>(() => {});
      }
      throw err;
    }),
  );
}

const Play = page(() => import('./pages/Play.tsx'));
const Stage = page(() => import('./pages/Stage.tsx'));
const Host = page(() => import('./pages/Host.tsx'));
const Login = page(() => import('./pages/Login.tsx'));
const Admin = page(() => import('./pages/Admin.tsx'));
const Questions = page(() => import('./pages/teacher/Questions.tsx'));
const QuestionEdit = page(() => import('./pages/teacher/QuestionEdit.tsx'));
const Review = page(() => import('./pages/admin/Review.tsx'));
const Teachers = page(() => import('./pages/admin/Teachers.tsx'));
const Subjects = page(() => import('./pages/admin/Subjects.tsx'));
const Account = page(() => import('./pages/Account.tsx'));
const Contest = page(() => import('./pages/admin/Contest.tsx'));
const Print = page(() => import('./pages/admin/Print.tsx'));
const Import = page(() => import('./pages/teacher/Import.tsx'));

function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="display text-3xl">없는 화면이에요</h1>
      <a href="/join" className="btn btn-primary">
        참가 화면으로
      </a>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Join />} />
          <Route path="/join" element={<Join />} />
          <Route path="/play/:id" element={<Play />} />
          <Route path="/stage/:id" element={<Stage />} />
          <Route path="/host/:id" element={<Host />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/review" element={<Review />} />
          <Route path="/admin/contests/:id/print" element={<Print />} />
          <Route path="/admin/contests/:id/:tab?" element={<Contest />} />
          <Route path="/teacher/import" element={<Import />} />
          <Route path="/admin/teachers" element={<Teachers />} />
          <Route path="/admin/subjects" element={<Subjects />} />
          <Route path="/teacher/questions" element={<Questions />} />
          <Route path="/teacher/questions/new" element={<QuestionEdit />} />
          <Route path="/teacher/questions/:id" element={<QuestionEdit />} />
          <Route path="/account/password" element={<Account />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
