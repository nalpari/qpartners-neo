# 홈화면 (로그인 후) Design Document

> **Summary**: 최근 콘텐츠 + 최근 다운로드 API 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-28
> **Status**: Draft
> **Planning Doc**: [home.plan.md](../../01-plan/features/home.plan.md)
> **화면설계서**: p.20-21 (confirmed)

---

## 1. API Specification

### `GET /api/home/recent-contents` — 최근 콘텐츠

사용자 권한(userType)에 맞는 게시대상의 최근 콘텐츠 4개 반환.

**서버 처리 흐름:**
1. JWT에서 사용자 정보 (userType) 추출
2. qp_contents → qp_content_targets JOIN
3. userType에 해당하는 targetType + 게시 기간 내 필터
4. status = published, publishedAt DESC 정렬, LIMIT 4

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "title": "【住宅】販売のご案内",
      "publishedAt": "2026-03-09T00:00:00Z",
      "updatedAt": "2026-03-10T00:00:00Z",
      "isNew": true,
      "isUpdated": false,
      "categories": [
        { "categoryName": "정보유형", "values": ["기사", "파일", "동영상"] },
        { "categoryName": "업무분류", "values": ["영업마케팅"] }
      ],
      "hasAttachment": true
    }
  ]
}
```

### `GET /api/home/recent-downloads` — 최근 다운로드

로그인한 사용자의 최근 다운로드 내역 3개 반환.

**서버 처리 흐름:**
1. JWT에서 사용자 정보 (userType, userId) 추출
2. qp_download_logs → qp_contents + qp_content_attachments JOIN
3. downloadedAt DESC 정렬, LIMIT 3
4. 콘텐츠 삭제/열람기간 만료 여부 판단

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "downloadedAt": "2026-03-09T00:00:00Z",
      "contentTitle": "納入仕様書_Re.RISE-NBC AG270",
      "fileName": "納入仕様書_Re.RISE-NBC AG270.pdf",
      "isExpired": false
    }
  ]
}
```

---

## 2. File Structure

```
src/app/api/home/
├── recent-contents/
│   └── route.ts
└── recent-downloads/
    └── route.ts
```

---

## 3. Implementation Order

| # | 작업 | 파일 |
|---|------|------|
| 1 | 최근 콘텐츠 API | `src/app/api/home/recent-contents/route.ts` |
| 2 | 최근 다운로드 API | `src/app/api/home/recent-downloads/route.ts` |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-28 | Initial draft | CK |
