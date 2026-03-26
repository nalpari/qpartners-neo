# Design: メインホームページ (home)

| 항목 | 내용 |
|------|------|
| Feature | home |
| 작성일 | 2026-03-26 |
| 설계안 | Option C — Pragmatic Balance |

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 사용자가 서비스 진입 시 콘텐츠를 빠르게 탐색하고, 로그인 상태에 따른 개인화 경험 제공 |
| **WHO** | Q.PARTNERS 회원 및 비회원 |
| **RISK** | 로그인 상태 판별, PC/모바일 레이아웃 분기 |
| **SUCCESS** | SC-01~SC-07 전체 충족 |
| **SCOPE** | `src/app/page.tsx` + `src/components/home/*` |

---

## 1. 컴포넌트 구조

```
src/app/page.tsx                          ← Server Component, 레이아웃 조합
src/components/home/
  ├── home-visual.tsx                     ← 비주얼 섹션 (Server)
  ├── home-search.tsx                     ← 검색바 (Client — 입력 상태)
  ├── home-contents.tsx                   ← コンテンツ 섹션 (Server)
  ├── home-content-card.tsx               ← 콘텐츠 카드 (Server)
  ├── home-sidebar.tsx                    ← 사이드바 (Server, 로그인 후 PC)
  └── home-dummy-data.ts                  ← 더미 데이터
```

## 2. 레이아웃 설계

### 2.1 PC (lg 이상)
- **로그인 전**: max-w-[1440px] 중앙 정렬, コンテンツ full-width
- **로그인 후**: flex 레이아웃 — 좌측 콘텐츠(flex-1) + 우측 사이드바(w-[280px])

### 2.2 모바일 (lg 미만)
- 1열 full-width, 사이드바 미표시
- 검색바: 패딩 px-[24px]

## 3. 주요 Figma 디자인 토큰

| 요소 | 값 |
|------|-----|
| 비주얼 배경 | 검은색 (임시) |
| Q.PARTNERS 타이틀 | Pretendard Bold, 약 48px, white |
| 설명 텍스트 | Noto Sans JP Regular, 14px, #d1d1d1 |
| 검색바 | h-[52px], border-[#ebebeb], 오렌지 버튼 bg-[#e97923] |
| 콘텐츠 섹션 배경 | bg-[#f7f9fb] (외부), bg-white (카드) |
| NEW 뱃지 | bg-[#f4f9fd], border-[#e3effb], text-[#63a5f2] |
| UPDATE 뱃지 | bg-[#fff3f8], border-[#f8e3eb], text-[#bc6e8d] |
| 카테고리 태그 라벨 | bg-[#f4f2f0], text-[#9c8b78], 11px |
| 카테고리 태그 값 | bg-white, border-[#f4f2f0], text-[#505050], 11px |
| 사이드바 프로필 | bg 오렌지 그라데이션, rounded-[16px] |
| Read More | text-[#004ea1], 11px, uppercase, tracking-[1.375px] |

## 4. 구현 순서

| # | 파일 | 설명 |
|---|------|------|
| 1 | home-dummy-data.ts | 더미 데이터 정의 |
| 2 | home-visual.tsx | 비주얼 섹션 |
| 3 | home-search.tsx | 검색바 |
| 4 | home-content-card.tsx | 콘텐츠 카드 |
| 5 | home-contents.tsx | コンテンツ 섹션 |
| 6 | home-sidebar.tsx | 사이드바 |
| 7 | page.tsx | 메인 페이지 조합 |
