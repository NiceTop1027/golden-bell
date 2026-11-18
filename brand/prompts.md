# 덕영 골든벨 로고 꾸미기: 생성 계획

## 입력
- 원본: `original/deokyoung_logo_original.png` (480×480, 손대지 않음)
- 고해상도 정리본: `source/logo_1920.png` (파란 바탕 #3D9AFF + 흰 마크)
- 흰 마크만 (투명 배경): `source/mark_white_1920.png`
- 마크 마스크: `source/mark_mask_1920.png` (합성·모양 검수용)

## 모델
- fal `fal-ai/nano-banana-pro/edit` (참조 이미지를 넣고 편집, 장당 약 $0.15)
- 시안 3종 × 1장으로 먼저 시험 (약 $0.45), 마음에 드는 방향만 추가 생성

## 공통 규칙
- 로고 마크 모양(d + y 결합형)은 절대 바꾸지 않음. 비율·두께·각도 그대로
- 학교 파란색 #3D9AFF 유지, 포인트 색은 금색 #F5C542
- 생성 후 마크 모양을 원본 마스크와 비교해서 틀어졌으면 원본 마크를 위에 다시 합성

## 시안 1: 공식 대회 엠블럼 (1:1)
Use the provided logo exactly as-is (do not redraw or alter the white mark's shape, proportions, or angles). Create an official school quiz championship emblem: the blue logo tile placed inside a circular badge with a polished gold rim and a subtle laurel wreath, a small golden bell at the top of the badge. Below the badge, bold clean Korean title text "덕영 골든벨" and a small English line "DEOKYOUNG GOLDEN BELL". Flat premium vector style, school blue #3D9AFF and gold #F5C542, white background, centered, high contrast, no extra text.

## 시안 2: 무대 타이틀 화면 (16:9)
Use the provided logo exactly as-is (keep the white mark's shape unchanged). Cinematic quiz show stage title screen: deep navy background with warm golden spotlights from above, soft gold particles and confetti, the logo shown as a glossy rounded tile floating in the center with a gentle glow. Under it, large gold metallic Korean title "덕영 골든벨". Clean, premium, readable from far away, no other text.

## 시안 3: 3D 아이콘 (1:1)
Use the provided logo exactly as-is (do not alter the mark's shape). Render it as a premium 3D app-icon style object: a rounded-square tile of glossy blue glass (#3D9AFF) with the white mark slightly extruded and softly beveled, a thin gold edge highlight, soft studio lighting and a subtle shadow on a clean light background. Minimal, no text.
