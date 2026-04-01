---
globs:
  - "src/app/**/*.css"
  - "src/app/**/*.tsx"
  - "src/components/**/*.tsx"
---
### Tailwind CSS v4 스타일링 규칙

- CSS 기반 설정 사용 (`globals.css` 내 `@theme inline`) — `tailwind.config.js` 사용하지 않음
- 커스텀 색상은 CSS 변수로 정의하고 `@theme inline`으로 등록
- 다크 모드: `prefers-color-scheme` 미디어 쿼리 기반, Tailwind `dark:` 접두사 사용
- Fonts: Geist Sans + Geist Mono via `next/font/google` as CSS variables

#### 클래스 작성 순서
레이아웃 → 크기 → 간격 → 타이포그래피 → 색상 → 기타:

```tsx
className="flex items-center w-full h-12 px-5 text-base font-medium text-background bg-foreground rounded-full transition-colors hover:bg-[#383838]"
```
