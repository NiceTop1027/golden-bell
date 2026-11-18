---
version: 1
slug: "src-pages-teacher-questionedit-tsx"
primary_target: "src/pages/teacher/QuestionEdit.tsx"
related_targets: ["src/pages/teacher/Questions.tsx","src/pages/admin/Review.tsx","src/pages/admin/Teachers.tsx","src/pages/Account.tsx"]
---

# 출제·검수 화면 (선생님 문제 목록·작성, 관리자 검수·선생님 계정, 비밀번호 변경)

Mode: Operate
Audience/job: 선생님은 쉬는 시간에 PC(가끔 폰)로 문제를 빠르게 쓰고 학생·무대에서 어떻게 보일지 확인한 뒤 제출한다. 관리자는 제출된 문제를 하나씩 확인하고 승인하거나 사유를 적어 반려한다. 관리자는 선생님 계정을 일괄로 만들고 처음 비밀번호를 한 번만 받아 전달한다.
Constraints: 계획서 5.1·5.2·5.4 상태 흐름(작성중→제출됨→승인됨/반려됨, 회수, 승인 후 수정 시 재검수), DESIGN.md 확립된 세계를 그대로 상속(새 세계 없음).

## Direction contract

THESIS: 출제 화면은 "쓰면서 바로 본다". 입력 카드 옆에 실제 학생 폰·무대 화면을 그대로 축소해 붙여, 쓰는 사람이 강당에서 어떻게 보일지 상상할 필요가 없게 한다. 거절한 것: 미리보기 없는 관리자 폼, 모달 위주의 CRUD 표.
OWN-WORLD: DESIGN.md 그대로 — grey-100 바탕, 흰 카드 24px, Pretendard 하나, 학교 파랑 하나, 4색 보기 타일. 상태는 회색(작성중)·연파랑(제출됨)·연초록(승인됨)·연빨강(반려됨) 알약.
STORY: 선생님은 유형을 고르고 문제·정답을 채우면 오른쪽 미리보기가 그대로 바뀌는 것을 보고 [제출하기]를 누른다. 반려되면 목록과 작성 화면 맨 위에서 사유를 먼저 본다. 관리자는 왼쪽 대기열에서 하나씩 넘기며 승인·반려한다.
FIRST VIEWPORT: 선생님 목록 — 제목·[새 문제 쓰기], 상태 탭(개수), 유형·과목 필터, 흰 카드 목록(유형·과목·학년·난이도 / 문제 / 상태 알약 / 반려 사유). 작성 — 왼쪽 카드 4개(유형·기본, 문제, 정답, 해설과 시간), 오른쪽 고정 미리보기(학생 폰|무대 화면), 아래 고정 행동 줄. 검수 — 왼쪽 대기열, 오른쪽 상세(문제·사실 표·정답·메모·승인/반려) + 미리보기.
FORM: 확립된 세계 확장 (ordinary extension, no roll). Signature move: 실제 PhonePreview·무대 QuestionScreen을 그대로 축소한 실시간 미리보기. seed: none (pinned) — 사용자가 고른 "⑤ 일반 퀴즈 앱, 토스 느낌, 학교 파랑" 세계를 DESIGN.md로 상속
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
