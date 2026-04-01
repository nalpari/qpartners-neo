# 다운로드 기록 Design Document

> **Summary**: 다운로드 기록 목록 조회 API 상세 설계
>
> **Project**: qpartners-neo
> **Author**: CK
> **Date**: 2026-03-28
> **Status**: Draft
> **Planning Doc**: [download-log.plan.md](../../01-plan/features/download-log.plan.md)
> **화면설계서**: p.41 (confirmed)

---

## 1. API Specification

### `GET /api/mypage/download-logs` — 다운로드 기록 조회

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| keyword | string | - | 제목 또는 자료명 Like 검색 |
| page | int | 1 | 페이지 번호 |
| pageSize | int | 20 | 페이지 크기 |

**서버 처리 흐름:**
1. JWT에서 사용자 정보 (userType, userId) 추출
2. qp_download_logs → qp_contents + qp_content_attachments JOIN
3. keyword로 title 또는 fileName Like 검색
4. downloadedAt DESC 정렬
5. 콘텐츠 삭제/열람기간 만료 여부 판단 (isExpired)

**Response (200):**
```json
{
  "data": {
    "totalCount": 1000,
    "page": 1,
    "pageSize": 20,
    "keyword": "검색어",
    "list": [
      {
        "id": 1,
        "downloadedAt": "2026-03-09T00:00:00Z",
        "contentId": 100,
        "contentTitle": "Re.RISE-G2 435",
        "attachmentId": 50,
        "fileName": "納入仕様書_Re.RISE-NBC AG270.pdf",
        "isExpired": false
      }
    ]
  }
}
```

- `isExpired = true`: 삭제 또는 열람기간 만료 → 프론트에서 취소선 + 다운로드 버튼 숨김

---

## 2. File Structure

```
src/app/api/mypage/
└── download-logs/
    └── route.ts              # GET
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-28 | Initial draft | CK |
