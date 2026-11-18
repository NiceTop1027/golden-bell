---
version: 1
slug: "src-pages-stage-tsx"
primary_target: "src/pages/Stage.tsx"
related_targets: ["src/pages/Play.tsx","src/pages/Host.tsx","src/pages/Join.tsx","src/pages/Login.tsx"]
---

# 대회 화면 (무대·학생·진행자·참가·로그인)

Mode: Operate (무대 화면은 표시 전용이지만 작업 흐름의 일부로 취급)
Audience/job: 학생은 10–40초 안에 답 한 번, 강당은 무대에서 지금 상태를 읽고, 진행자는 현재 가능한 다음 조작 하나를 실수 없이 누른다.
Constraints: 학생 폭 360px부터, 무대 1920×1080 문제 48px 이상·타이머 160px 이상, 색만으로 구분 금지(번호+색), 학교 로고 원형 보존.

## Direction contract

THESIS: 누구나 처음 봐도 쓸 줄 아는 퀴즈 앱의 표준 모습을, 토스 같은 국내 앱 수준으로 다듬는다. 거절한 것: 굵은 검정 테두리·딱딱한 그림자의 플레이풀 B, 남색·금색 무대 연출, 상장·OMR·안내판·격자 같은 세계 코스튬.
OWN-WORLD: 바탕 #F2F4F6, 흰 카드 반경 20–28px·테두리 없음, 글자 #191F28/#4E5968/#8B95A1 위계, 강조는 학교 파랑(#3D9AFF 장식, #1F6FE0 흰 글씨 버튼). 보기 타일 ① 빨강 ② 파랑 ③ 노랑(검정 글씨) ④ 초록 + 흰 번호 칸. Pretendard 하나로 숫자까지(800, 고정폭 숫자).
STORY: 학생은 색 타일 하나를 누르고, 고른 타일만 남고 나머지가 물러나는 것으로 제출을 안다. 강당은 무대의 큰 원형 타이머와 문제 카드로 상태를 읽는다. 진행자는 다음 단계 하나가 파란 큰 버튼으로 보인다.
FIRST VIEWPORT: 무대 — 위 줄 왼쪽 라운드 알약, 가운데 원형 타이머(숫자 큼), 오른쪽 생존 알약; 흰 문제 카드; 2×2 색 타일; 오른쪽 아래 제출 수. 학생 — 위 라운드·초, 파란 진행 막대, 흰 문제 카드, 폭 가득 색 타일 4개, 아래 상태 문구. 진행자 — 흰 헤더, 3단(현재 문제·진행·알림/학생), 큰 파란 주 버튼.
FORM: 카테고리 표준(canon) 선택, 완성도 기준 토스·당근. Signature move: 원형 타이머가 줄어들고 마지막 5초 빨강, 정답 공개 때 정답 타일만 남고 나머지가 흐려지며 선택 인원 막대가 자람. seed:4a045073dfcd93fa (canon 선택)
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
