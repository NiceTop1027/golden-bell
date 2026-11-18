# 덕영 골든벨

덕영고등학교(IT 특성화고) 교내 **골든벨 퀴즈** 를 운영하기 위한 실시간 웹 플랫폼입니다.
진행자(선생님)가 무대 화면에 대회 코드를 띄우면, 학생들은 노트북·PC·휴대폰 브라우저에서 코드와 학번·이름으로 바로 참가합니다.
예선부터 결승(골든벨)까지의 모든 진행이 Socket.IO로 실시간 동기화됩니다.

> 교내 행사 운영용 사내(교내) 도구입니다. 외부 공개용이 아닙니다.

---

## 핵심 기능

### 문제 은행
- 문제 출제·수정·검수, 과목(교과) 관리
- 문제 유형: **OX / 객관식 / 단답 / 초성 / 숫자 / 순서 맞추기**
- **엑셀(.xlsx)·CSV 일괄 업로드** — 맥·윈도우 상관없이 동작
  (UTF-8, UTF-8 BOM, CP949/EUC-KR 한글 CSV 모두 자동 인식)

### 대회 운영
- 대회 편성 상태: `DRAFT(편성중) → LOCKED → LIVE → FINISHED`
- 라운드: **예선 · 본선 · 부활 · 결승(골든벨) · 예비**
- 참가 명단 관리, 라운드별 문제 배치(드래그 정렬)

### 실시간 진행 (화면 3종)
- **무대 화면** — 문제·타이머·QR 코드·생존자 현황을 큰 화면에 표시
- **진행자 화면** — 문제 읽기 → 응답 → 마감 → 공개 → 확정 → 다음 문제 흐름 제어
- **학생 화면** — 코드·학번·이름으로 참가, 실시간 응답, 탈락/생존 안내
- **자동 진행 모드** — 진행자가 켜 두면 단계가 자동으로 넘어가고 탈락을 자동 안내,
  필요할 때 **일시정지·수동 개입** 가능

### 계정·권한
- **선생님 = 관리자** 동일 권한. 선생님도 다른 선생님 계정을 생성·관리할 수 있음
- 비밀번호는 **argon2** 로 해시 저장, 최초 로그인 시 비밀번호 변경 유도

### 보안
- 세션 쿠키 기반 인증(운영 환경에서는 `Secure` 쿠키 → HTTPS 필요)
- 동일 출처(Origin) 검증으로 CSRF·소켓 가로채기 차단
- 보안 응답 헤더: CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, 운영 환경 HSTS
- 레이트리밋: 로그인 시도, 참가 코드 추측, 참가 코드 조회 각각 분리 제한
- 업로드 방어: 이미지 재인코딩(sharp), zip(.xlsx) **압축 폭탄** 차단, CSV **수식 인젝션**(`=`,`+`,`@` 등) 무력화
- 서버 내부 오류(DB 메시지 등)는 화면에 노출하지 않음

---

## 기술 스택

모노레포(pnpm workspace):

| 패키지 | 이름 | 스택 |
| --- | --- | --- |
| `apps/server` | `@gb/server` | Fastify 5 · Socket.IO 4 · Prisma 7 (`@prisma/adapter-pg`) · PostgreSQL · argon2 · exceljs · sharp · zod |
| `apps/web` | `@gb/web` | React 19 · react-router 7 · Vite · Tailwind · socket.io-client · @dnd-kit · qrcode · Pretendard |
| `packages/shared` | `@gb/shared` | 서버·웹 공용 타입/스키마/정규화 (`/types`, `/schemas`, `/normalize`) |
| `tools/loadtest` | `@gb/loadtest` | 가상 학생 봇 부하 테스트 |

- 런타임: Node.js + `tsx`
- DB: PostgreSQL (`docker-compose.yml`, 기본 `127.0.0.1:5544`)
- 패키지 매니저: pnpm 10

---

## 로컬 실행

### 1. 사전 준비
- Node.js 20+, pnpm 10, Docker (PostgreSQL 용)

### 2. 설치·환경 변수
```bash
pnpm install
cp .env.example .env    # 값 채우기 (아래 참고)
```

`.env` 항목:

| 변수 | 설명 | 예시 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 접속 주소 | `postgresql://goldenbell:goldenbell@127.0.0.1:5544/goldenbell` |
| `PORT` | 서버 포트 | `4310` |
| `PUBLIC_URL` | 외부에서 접속하는 주소(개발 시 Vite) | `http://localhost:5310` |
| `SESSION_SECRET` | 세션 서명 비밀키 (**반드시 바꿀 것**) | 랜덤 문자열 |

### 3. DB 준비
```bash
pnpm db:up        # Postgres 컨테이너 기동
pnpm db:migrate   # 스키마 반영
pnpm db:seed      # 초기 데이터
```

### 4. 개발 서버
```bash
pnpm dev          # 서버 + 웹 동시 실행
```

### 5. 운영 빌드/실행
```bash
pnpm build                       # 웹 정적 빌드(apps/web/dist)
NODE_ENV=production pnpm start    # 서버가 빌드된 웹을 함께 서빙
```
> 운영 환경에서는 세션 쿠키가 `Secure` 라 **HTTPS** 로 접속해야 로그인/참가가 됩니다.

### 자주 쓰는 스크립트
| 명령 | 설명 |
| --- | --- |
| `pnpm dev` | 서버·웹 동시 개발 실행 |
| `pnpm build` | 웹 정적 빌드 |
| `pnpm start` | 서버 실행(운영) |
| `pnpm test` | 전체 테스트 |
| `pnpm typecheck` | 타입 검사 |
| `pnpm db:up` / `db:migrate` / `db:seed` | DB 기동·마이그레이션·시드 |
| `pnpm bots` | 가상 학생 봇 부하 테스트 |

---

## 디렉터리 구조
```
apps/
  server/   Fastify API + Socket.IO + Prisma
  web/      React(무대·진행자·학생·관리 화면)
packages/
  shared/   공용 타입·스키마
tools/
  loadtest/ 부하 테스트 봇
docs/       운영/기능 문서
PRODUCT.md  제품 맥락
DESIGN.md   디자인 시스템
```

---

## 라이선스 / 사용 범위
덕영고 교내 골든벨 운영을 위한 비공개 프로젝트입니다.
