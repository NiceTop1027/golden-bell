---
name: 덕영 골든벨
description: 학교 대회용 서바이벌 퀴즈. 회색 바탕 위 흰 둥근 카드, 번호+색 보기 타일, 학교 파랑 하나.
colors:
  school: "#3d9aff"
  school-deep: "#1f6fe0"
  school-50: "#eef6ff"
  school-100: "#dbeaff"
  opt1: "#f04452"
  opt2: "#2f7df6"
  opt3: "#ffc12e"
  opt4: "#0e9f5f"
  opt5: "#8a5cf6"
  red: "#f04452"
  red-deep: "#d22030"
  red-50: "#fff0f1"
  green: "#0e9f5f"
  green-50: "#e9f8f0"
  amber: "#ffc12e"
  amber-50: "#fff8e6"
  white: "#ffffff"
  grey-50: "#f9fafb"
  grey-100: "#f2f4f6"
  grey-200: "#e5e8eb"
  grey-300: "#d1d6db"
  grey-400: "#b0b8c1"
  grey-500: "#8b95a1"
  grey-600: "#6b7684"
  grey-700: "#4e5968"
  grey-800: "#333d4b"
  grey-900: "#191f28"
typography:
  display:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  stage-question:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "88px"
    fontWeight: 800
    lineHeight: 1.18
    letterSpacing: "-0.03em"
  stage-label:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 1.25
  display-phone:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  display-phone-lg:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "2.5rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  question-phone:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.45
  tile:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 800
    lineHeight: 1.35
  title:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.375
  body:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  label:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.4
  caption:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.5
  numeral:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "'tnum'"
rounded:
  card: "24px"
  tile: "18px"
  btn: "16px"
  field: "14px"
  badge: "10px"
  pill: "9999px"
spacing:
  xs: "8px"
  tile-gap: "10px"
  sm: "12px"
  gutter: "16px"
  gutter-wide: "20px"
  console: "24px"
  stage-gap: "32px"
  stage-gutter: "80px"
components:
  button-primary:
    backgroundColor: "{colors.school-deep}"
    textColor: "{colors.white}"
    typography: "{typography.body}"
    rounded: "{rounded.btn}"
    padding: "0 20px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "#1a62c9"
  button-neutral:
    backgroundColor: "{colors.grey-100}"
    textColor: "{colors.grey-800}"
    rounded: "{rounded.btn}"
    padding: "0 20px"
    height: "52px"
  button-neutral-hover:
    backgroundColor: "{colors.grey-200}"
  button-tint:
    backgroundColor: "{colors.school-50}"
    textColor: "{colors.school-deep}"
    rounded: "{rounded.btn}"
    height: "52px"
  button-tint-hover:
    backgroundColor: "{colors.school-100}"
  button-danger:
    backgroundColor: "{colors.red}"
    textColor: "{colors.white}"
    rounded: "{rounded.btn}"
    height: "52px"
  button-danger-hover:
    backgroundColor: "{colors.red-deep}"
  button-sm:
    rounded: "{rounded.badge}"
    padding: "0 12px"
    height: "36px"
  button-lg:
    height: "60px"
  chip:
    backgroundColor: "{colors.white}"
    textColor: "{colors.grey-800}"
    rounded: "{rounded.pill}"
    padding: "0.3em 0.8em"
  field:
    backgroundColor: "{colors.grey-100}"
    textColor: "{colors.grey-900}"
    rounded: "{rounded.field}"
    padding: "0 16px"
    height: "56px"
  field-focus:
    backgroundColor: "{colors.white}"
  card:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.card}"
  card-sub:
    backgroundColor: "{colors.grey-50}"
    rounded: "{rounded.btn}"
  key-tile-1:
    backgroundColor: "{colors.opt1}"
    textColor: "{colors.white}"
    rounded: "{rounded.tile}"
    padding: "10px 16px 10px 12px"
    height: "64px"
  key-tile-2:
    backgroundColor: "{colors.opt2}"
    textColor: "{colors.white}"
    rounded: "{rounded.tile}"
    height: "64px"
  key-tile-3:
    backgroundColor: "{colors.opt3}"
    textColor: "{colors.grey-900}"
    rounded: "{rounded.tile}"
    height: "64px"
  key-tile-4:
    backgroundColor: "{colors.opt4}"
    textColor: "{colors.white}"
    rounded: "{rounded.tile}"
    height: "64px"
  key-tile-5:
    backgroundColor: "{colors.opt5}"
    textColor: "{colors.white}"
    rounded: "{rounded.tile}"
    height: "64px"
  key-badge:
    rounded: "{rounded.badge}"
    size: "36px"
  timer-track:
    backgroundColor: "{colors.grey-200}"
    rounded: "{rounded.pill}"
    height: "8px"
  timer-fill:
    backgroundColor: "{colors.school}"
  timer-fill-low:
    backgroundColor: "{colors.red}"
---

# Design System: 덕영 골든벨

## Overview

**Creative North Star: "처음 봐도 아는 퀴즈 앱, 끝까지 다듬은 한 판"**

누구나 한 번쯤 써 본 퀴즈 앱의 표준 모습을 그대로 받아들이고, 그 위에서 국내 앱(토스·당근) 수준의 다듬기로 승부한다. 밝은 회색 바탕(grey-100) 위에 테두리 없는 흰 둥근 카드가 놓이고, 글자는 Pretendard 하나로 숫자까지 처리한다. 강조는 학교 파랑 하나뿐이며, 보기 타일만이 빨강·파랑·노랑·초록·보라의 다섯 색을 쓴다. 색은 언제나 번호와 함께 나온다.

화면은 세 가지 밀도로 같은 체계를 공유한다. 학생 폰은 폭 가득 쌓인 색 타일과 큰 탭 영역(최소 64px)의 한 손 화면, 무대 화면은 1920×1080 고정 캔버스를 비율대로 키운 프로젝터 화면(문제 88px, 원형 타이머 큼), 진행자 콘솔은 흰 헤더와 3단 카드 격자에 파란 큰 주 버튼 하나가 다음 단계를 말해 주는 화면이다. 상태 변화는 모양과 물러남으로 전달한다. 고른 타일만 남고 나머지는 연한 색으로 한 발 물러나며, 마지막 5초는 타이머가 빨강으로 바뀐다.

거절한 방향은 분명하다. 굵은 검정 테두리와 딱딱한 오프셋 그림자의 플레이풀 스타일, 남색·금색 무대 연출, 상장·OMR·안내판 같은 세계 코스튬은 사용자가 거절했다.

**Key Characteristics:**
- 회색 바탕 + 테두리 없는 흰 카드(24px), 그림자는 거의 없음
- Pretendard 한 가족, 굵기 600/700/800, 숫자는 고정폭(tnum)
- 학교 파랑 하나만 강조, 흰 글씨 버튼은 진한 파랑(school-deep)
- 보기 타일은 번호 칸 + 색, 노랑 타일만 검정 글씨
- 누르면 0.97로 줄어드는 120ms 반응, 큰 연출은 정답 공개 순간에만

## Colors

차분한 토스풍 회색 계단 위에 학교 파랑 하나, 그리고 보기 타일에만 허락된 다섯 원색.

### Primary
- **학교 파랑** (school): 장식과 진행 표시 전용. 타이머 막대·원형 타이머 링, 포커스 링(3px 외곽선), 입력칸 포커스 링. 흰 글씨 바탕으로는 쓰지 않는다(대비 부족).
- **진한 학교 파랑** (school-deep): 흰 글씨가 올라가는 주 버튼 바탕(대비 4.8:1), 파랑 글씨 강조(입장 코드, 초성 힌트, 틴트 버튼 글씨), 입력 커서.
- **연한 파랑** (school-50 / school-100): 틴트 버튼 바탕과 그 hover, 텍스트 선택 영역.

### Secondary
- **보기 다섯 색** (opt1 빨강, opt2 파랑, opt3 노랑, opt4 초록, opt5 보라): 보기 타일과 정답 공개 막대에만 쓴다. ① 빨강 ② 파랑 ③ 노랑 ④ 초록 ⑤ 보라의 순서는 고정이며, OX 문제에서는 O = opt2 파랑, X = opt1 빨강이다.

### Tertiary
- **상태 색** (red / red-deep / red-50, green / green-50, amber / amber-50): 빨강은 탈락·오답·마지막 5초·위험 버튼·연결 끊김, 초록은 정답·생존·패자부활, 노랑은 골든벨 문제 라운드 알약과 주의 안내. 각 50 단계는 같은 의미의 안내 상자 바탕이다.

### Neutral
- **바탕 회색** (grey-100): 모든 화면의 바탕, 보조 버튼과 입력칸 바탕.
- **흰색** (white): 카드, 알약, 진행자 헤더.
- **글자 계단** (grey-900 / grey-700 / grey-500): 제목·본문 주 글자 / 설명·보조 글자(가장 많이 쓰임) / 플레이스홀더·흐린 숫자.
- **선과 트랙** (grey-200, grey-100): 타이머 트랙, 진행자 헤더 아래선, 표 행 구분선.
- **진한 회색 띠** (grey-900): 학생 화면 하단 "제출했어요" 상태 띠, 반투명(90%) 토스트.

### Named Rules
**The 한 파랑 Rule.** 강조색은 학교 파랑 하나다. 흰 글씨 위에는 school-deep, 그 외 장식에는 school. 새 강조색을 들이지 않는다.

**The 번호와 색 Rule.** 보기 색은 절대 혼자 쓰지 않는다. 모든 보기 타일과 공개 막대는 번호 칸(또는 보기 글자)과 함께 나온다.

**The 노랑은 검정 글씨 Rule.** opt3/amber 바탕에는 언제나 grey-900 글씨, 번호 칸은 흰 반투명 대신 검정 12% 반투명.

## Typography

**Display Font:** Pretendard Variable (with Pretendard, -apple-system, Apple SD Gothic Neo, Noto Sans KR)
**Body Font:** 같은 Pretendard Variable

**Character:** 한 가족, 굵기만으로 위계를 만든다. 큰 글자는 800에 자간을 조여(-0.03em) 단단하게, 본문은 600으로 또렷하게. 숫자는 모두 고정폭이라 타이머와 집계가 흔들리지 않는다. 한국어 줄바꿈은 낱말 단위(keep-all).

### Hierarchy
- **Display** (800, 1.75–2rem, 1.25): 학생 화면의 결과·대기 제목("정답이에요!", 입장 제목), 선생님·관리자 화면의 페이지 제목(1.75rem). 학생 폰의 우승·최종 순위 한 줄만 2.5rem(`display-phone-lg`).
- **Phone Question** (700, 1.25rem = 20px, 1.45): 학생 폰 문제 카드. 계획서 17.3의 "학생 화면 문제 20px" 기준.
- **Stage Question** (800, 88px, 긴 문제는 68px / 1.25): 무대 문제 카드. 정답 글자는 128px(긴 답 88px).
- **Stage Label** (600–700, 34–44px): 무대의 보조 줄, 집계 라벨, 해설. 무대 본문 글자는 이 범위가 바닥이고, 26px은 막대 안 "정답" 알약에만 쓴다.
- **Title** (700, 1.375rem, 1.375): 확인창 제목, 콘솔 카드 제목. 실패·대기 안내 h1은 1.5rem 700.
- **Body** (600–700, 1.0625–1.125rem): 버튼 글자(1.0625rem 700), 보기 타일 글자(1.125rem 800, `tile` = 계획서 17.3의 18px).
- **Label** (600, 0.9375rem): 생존 수, 상태 띠, 안내 상자.
- **Caption** (600, 0.875rem): 진행자 콘솔 표, 보조 설명. 가장 많이 쓰이는 크기.
- **Numeral** (800, tnum, -0.04em): 학생 타이머 숫자 1.5rem, 무대 원형 타이머는 지름의 42%, 입장 코드 150px.

### Named Rules
**The 굵기로 위계 Rule.** 글꼴을 섞지 않는다. 위계는 크기와 600/700/800 세 굵기로만 만든다.

**The 숫자는 고정폭 Rule.** 초, 인원, 점수, 코드처럼 바뀌는 숫자는 모두 tabular-nums.

## Layout

학생 화면은 가운데 정렬된 한 줄 기둥(최대 32rem)에 좌우 16–20px 여백. 위쪽은 반투명 회색(90% + blur)으로 고정된 헤더(라운드 알약 · 생존 수, 그 아래 진행 막대와 초), 그 아래 흰 문제 카드와 폭 가득 쌓인 보기 타일(간격 10px), 맨 아래 상태 띠. OX는 2열 정사각형에 가까운 타일 두 개. 안전 영역(env(safe-area-inset-*))을 지킨다.

무대 화면은 1920×1080 고정 캔버스를 창 크기에 맞게 통째로 확대·축소한다. 좌우 여백 80px, 요소 간격 24–32px. 위 줄은 3열(왼쪽 라운드 알약, 가운데 원형 타이머, 오른쪽 생존 수), 그 아래 흰 문제 카드, 남은 높이를 2×2 색 타일이 채운다.

진행자 콘솔은 흰 헤더(아래 1px grey-200 선) 아래 24px 패딩, 20px 간격의 격자. 1280px 이상에서 3단(현재 문제 1.25 : 진행 1 : 알림·학생 0.95), 그 아래는 1단.

간격 리듬은 8 / 10 / 12 / 16 / 20 / 24px의 작은 계단, 무대에서는 32 / 80px로 커진다.

## Elevation & Depth

평평한 것이 기본이다. 깊이는 회색 바탕 위 흰 카드라는 톤 차이로 만들고, 그림자는 무대 위에 떠오르는 순간에만 쓴다.

### Shadow Vocabulary
- **pop** (`box-shadow: 0 12px 32px rgba(25, 31, 40, 0.12)`): 무대의 "마감!" 도장 카드, 우승 카드, 무대 위 떠 있는 버튼.
- **soft** (`box-shadow: 0 2px 8px rgba(25, 31, 40, 0.06)`): 무대 대기실 QR 카드.
- **dialog** (`box-shadow: 0 24px 64px rgba(25, 31, 40, 0.2)`): 확인창, 뒤 배경은 grey-900 45%.
- **선택 고리** (`box-shadow: 0 0 0 3px #fff, 0 0 0 6px #191f28`): 고른 보기 타일. 그림자가 아니라 흰 틈 + 검정 고리.

### Named Rules
**The 평평한 카드 Rule.** 카드는 테두리도 그림자도 없다. 바탕과의 톤 차이로만 떠 있다. 그림자는 화면 위로 튀어나오는 순간(도장, 우승, 확인창)에만.

## Shapes

모든 모서리가 넉넉하게 둥글고 테두리가 없다. 크기에 따라 반경이 줄어드는 단순한 계단: 카드 24px, 보기 타일 18px, 버튼 16px, 입력칸·안내 상자 14px, 번호 칸·작은 버튼 10px, 알약·막대 완전한 원. 무대 화면은 캔버스가 크므로 같은 비율로 키운다(보기 타일 32px, OX 타일 36px, 번호 칸 22px). 학교 로고는 원본 마크를 24% 둥근 사각형으로만 자르고 32px 미만으로 쓰지 않는다. O는 파란 원, X는 둥근 끝의 빨간 X로 모양과 색을 함께 쓴다.

## Components

### Buttons
차분하고 단단하며, 누르면 바로 반응한다.
- **Shape:** 둥근 모서리(16px), 높이 52px(큰 버튼 60px, 작은 버튼 36px·10px 반경), 글자 1.0625rem 700.
- **Primary:** school-deep 바탕 + 흰 글씨. 화면마다 다음 단계 하나에만.
- **Hover / Focus:** hover는 마우스 기기에서만 한 단계 진하게(150ms). 누르면 0.97로 줄어듦(120ms, ease-out). 포커스는 3px school 외곽선 + 2px 띄움.
- **Neutral / Tint / Danger:** 회색(grey-100 → hover grey-200), 틴트(school-50 + school-deep 글씨), 위험(red → hover red-deep). 비활성은 grey-100 바탕 + grey-400 글씨, Primary 비활성은 grey-200 바탕 + grey-600 글씨(약 3.7:1, 흰 글씨 연파랑은 1.2:1이라 쓰지 않음).
- **대회 목록·대회 헤더의 [진행자 화면]:** 진행 중일 때만 Primary, 잠김은 Tint, 끝난 대회는 회색 [결과]로 바뀐다(목록). 한 화면에 파란 버튼이 둘 이상 서지 않게 한다.
- **되돌릴 수 없는 일:** 리허설 기록 지우기·대회 지우기 같은 동작은 목록 줄에 두지 않고 대회 설정 맨 아래 카드로 모으며, 확인창을 거친다.
- **진행자 주 버튼:** 높이 104px, 22px 반경, 1.75rem 800 동작 이름 + 작은 힌트 줄. 콘솔에서 다음 단계를 말하는 단 하나의 버튼.

### Chips
- **Style:** 흰 바탕, grey-800 700 글씨, 완전한 원 반경, 0.3em 0.8em.
- **State:** 라운드 알약은 일반 흰색, 골든벨 문제는 amber 바탕 + grey-900, 패자부활은 green 바탕 + 흰 글씨. 문제 유형은 같은 알약 안에 600 · 60% 불투명으로 붙는다.
- **출제 상태 알약:** 작성중 grey-100 + grey-700, 제출됨 school-50 + school-deep, 승인됨 green-50 + green, 반려됨 red-50 + red-deep. 0.875rem 700.
- **대회 상태 알약:** 편성중 grey-200 + grey-800(흰 카드 위에서도 보이게 grey-100보다 한 단계 진하게), 잠김 school-50 + school-deep, 진행 중 school-deep + 흰 글씨(가장 강함), 끝남 green-50 + green. 0.875rem 700.
- **관리자 라운드 색:** 편성 줄의 번호 칸과 요약 알약에만 쓴다. 예선 grey-100 + grey-800, 본선 school-50 + school-deep, 패자부활 green-50 + green, 골든벨 amber-50 + grey-900, 예비 grey-50 + grey-700. 학생·무대의 라운드 알약 규칙과는 따로다.

### Cards / Containers
- **Corner Style:** 24px.
- **Background:** white. 카드 안 보조 영역은 grey-50 + 16px.
- **Shadow Strategy:** 없음(Elevation의 평평한 카드 규칙).
- **Border:** 없음.
- **Internal Padding:** 학생 20–24px, 콘솔 20–32px, 무대 40–112px.

### Inputs / Fields
- **Style:** grey-100 바탕, 테두리 없음, 14px 반경, 높이 56px, 600 글씨, 플레이스홀더 grey-500 500.
- **Focus:** 흰 바탕으로 바뀌고 2px school 고리(150ms).
- **Error / Disabled:** 2px red 고리(aria-invalid), 비활성 글씨 grey-500. 오류 문구는 red-50 상자 + red-deep 글씨.
- **회색 바탕 위:** 바탕이 grey-100인 곳(필터, 로그인·비밀번호 화면)의 입력칸은 흰 바탕으로 둬서 칸으로 읽히게 한다.
- **촘촘한 줄:** 객관식 보기처럼 한 줄에 여러 칸이 붙는 곳은 높이 48px, 필터 선택은 40px.

### Tabs
- **한 화면의 큰 갈래(대회 관리의 편성·설정·명단·결과):** 글자 탭 + 아래 2px grey-900 밑줄, 비선택 grey-600. 저장하지 않은 변경이 있는 탭은 이름 옆에 6px school-deep 점.
- **카드 안의 보기 전환·값 고르기:** Segmented(grey-100 홈 안에 흰 알약). 두 스타일을 한 층위에 섞지 않는다.

### Data Display
- **정답률 막대:** 8px grey-100 트랙 위 green 막대 + 오른쪽 고정폭 % · 맞힘/대상. 막대는 비율만 말하고 색으로 좋고 나쁨을 가르지 않는다.
- **링크·코드 표시:** grey-100 10px 반경 상자, 고정폭 숫자 글꼴, 넘치면 한 줄 말줄임.
- **편성 제한시간 칸:** 실제로 쓰일 초를 언제나 grey-900으로 보여 주고, 이 대회에서 바꾼 값만 school-50 + school-deep으로 칠한다. 위에 범례 한 줄을 둔다.

### Navigation
- **진행자·관리자 헤더:** 흰 바탕, 아래 1px grey-200 선, 24px 좌우 여백, 로고 + 대회 이름 + 연결 점(초록/빨강 2px 원 + 글자).
- **선생님·관리자 메뉴 줄:** 흰 바탕(반투명·blur 없음), 높이 56px, 안쪽 폭은 페이지와 상관없이 항상 1440px 고정이라 화면을 옮겨도 로고와 메뉴가 움직이지 않는다. 현재 메뉴는 grey-100 알약. 폰(640px 미만)에서는 1줄에 로고·계정, 2줄에 메뉴를 가로로 두고(메뉴 4–5개), 이름 대신 사람 아이콘이 비밀번호 화면으로 간다. 메뉴는 선생님·관리자가 같고 관리자만 [선생님]이 더 있다.
- **고정 행동 줄 (출제 화면·대회 설정):** 흰 바탕, 위 1px grey-200 선, 안쪽 폭 1440px. 폰에서는 알림 문구가 버튼 위 한 줄로 올라가고, 미리보기는 아래 시트로 연다. 대회 설정은 바꾼 것이 있을 때만 나타나 "저장하지 않은 설정이 있어요" + [되돌리기] + [저장] 하나로 모든 카드를 함께 저장한다.
- **저장하지 않고 나가기:** 저장하지 않은 편성·설정·명단이 있으면 탭·메뉴·뒤로 링크를 누를 때 확인창("저장하지 않은 ○○이 있어요")을, 새로고침·닫기에는 브라우저 확인을 띄운다. 그동안 [편성 잠그기]는 막고 이유를 버튼 아래 한 줄로 적는다.
- **폰의 대회 헤더:** 제목 1.5rem, 정보 한 줄 말줄임, 버튼 높이 40px로 줄이고 인쇄 버튼은 숨겨 탭이 첫 화면 위쪽에 오게 한다.
- **학생 헤더:** 반투명 grey-100 + blur 고정 줄, 라운드 알약 · 생존 수, 그 아래 타이머 막대.

### 보기 타일 (Signature)
학생이 누르는 단 하나의 물건.
- **기본:** 보기 색 바탕, 흰 글씨(노랑만 grey-900), 18px 반경, 최소 64px, 왼쪽 36px 번호 칸(10px 반경, 흰 25% 반투명), 글자 1.125rem 800.
- **선택:** 흰 3px 틈 + grey-900 3px 고리, 오른쪽 흰 원 체크 표시.
- **제출 후 나머지:** 같은 색을 14%만 섞은 연한 바탕 + 같은 색의 진한 글씨, 번호 칸은 흰 85%. 다시 고를 수 있게 읽히되 한 발 물러난다.
- **마감 후 비활성:** 고르지 않은 타일 35% 불투명.
- **정답 공개:** 정답 타일에 흰 "정답" 알약, 오답 타일은 35% 불투명.

### 타이머 (Signature)
- **막대(학생·진행자):** 8px grey-200 트랙 위 school 막대가 줄어들고, 마지막 5초 red(300ms 색 전환). 오른쪽에 800 고정폭 초.
- **원형(무대):** 흰 원 위 grey-200 링, school 링이 둥근 끝으로 줄어들고 마지막 5초 red. 숫자는 지름의 42%.

### 정답 공개 막대 (Signature)
무대 1500px 흰 카드 안에 보기별 한 줄: 라벨(40px 700) · 48px 높이 14px 반경 막대(보기 색, 왼쪽에서 600ms ease-out으로 자람, 줄마다 70ms 늦게) · 인원(52px 800). 정답 줄에 초록 "정답" 알약, 오답 줄은 45% 불투명 막대와 grey-600 라벨.

### 확인창
최대 420px 흰 카드(24px), 200ms 0.96→1 확대 등장, 제목 1.375rem 700, 설명 grey-700, 아래 같은 폭 버튼 줄.

## Do's and Don'ts

### Do:
- **Do** 모든 화면 바탕을 grey-100(#f2f4f6)으로, 내용은 흰 카드(24px, 테두리·그림자 없음)에 담는다.
- **Do** 흰 글씨 버튼에는 school-deep(#1f6fe0)을, 링·막대·포커스 같은 장식에는 school(#3d9aff)을 쓴다.
- **Do** 보기 색에는 언제나 번호 칸을 붙이고, ① 빨강 ② 파랑 ③ 노랑 ④ 초록 ⑤ 보라 순서를 지킨다.
- **Do** 누를 수 있는 것은 누르면 0.97로 줄어들게 한다(120ms, cubic-bezier(0.23, 1, 0.32, 1)). hover는 (hover: hover) 기기에서만.
- **Do** 바뀌는 숫자는 모두 고정폭 800으로.
- **Do** 움직임 줄이기 설정에서는 등장 연출을 200ms 투명도 변화로 바꾸고 색종이는 멈춘다.

### Don't:
- **Don't** 굵은 검정 테두리나 딱딱한 오프셋 그림자를 쓰지 않는다(사용자가 거절한 플레이풀 방향).
- **Don't** 남색·금색 무대 연출이나 상장·OMR·안내판 같은 코스튬을 들이지 않는다.
- **Don't** 학교 파랑 바탕(#3d9aff)에 흰 글씨를 얹지 않는다.
- **Don't** 무대 화면에서 문제를 48px 아래로, 보조 글자를 34px 아래로 내리지 않는다(막대 안 "정답" 알약 26px만 예외).
- **Don't** 학교 로고를 늘리거나 기울이거나 다시 그리지 않고, 32px 미만으로 쓰지 않는다.
- **Don't** 방송 프로그램의 로고·디자인·효과음을 흉내 내지 않는다.
