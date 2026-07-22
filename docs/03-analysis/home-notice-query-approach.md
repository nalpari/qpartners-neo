# 홈 화면 공지 역할별 노출 한도 조회 방식

## 대상

- `src/app/api/home-notices/[id]/route.ts`의 `PUT`
- `src/app/api/home-notices/route.ts`의 `POST`

두 API는 공지 게시 기간이 겹칠 때, 역할(`roleCode`)별로 이미 게시된 공지가 5건 이상인지 확인한다.

> **적용 상태 (2026-07-22):** Prisma `groupBy` 방식으로 확정·적용 완료. Raw SQL은 교체되어 코드베이스에 남아 있지 않다.

## 현재 방식: Prisma `groupBy` (채택)

`HomeNoticeTarget` 모델의 관계 필터와 `groupBy`로 역할별 한도를 검사한다.

```ts
const overLimit = await tx.homeNoticeTarget.groupBy({
  by: ["roleCode"],
  where: {
    roleCode: { in: codesToCheck },
    homeNotice: {
      id: { not: parsed.data },
      startAt: { lte: finalEndAt },
      endAt: { gte: finalStartAt },
    },
  },
  having: {
    homeNoticeId: { _count: { gte: 5 } },
  },
  orderBy: { roleCode: "asc" },
  take: 1,
});

if (overLimit.length > 0) {
  throw new HomeNoticeUpdateError("LIMIT_EXCEEDED", overLimit[0].roleCode);
}
```

`POST`에서는 수정 대상 제외 조건만 제거하고, `codesToCheck` 대신 `result.data.targetRoleCodes`를 사용한다.

### 주의 사항

- Prisma `groupBy`에서 `take`를 사용하면 `orderBy`가 필수다. 누락 시 타입 오류가 발생하고 결과 타입이 깨진다.

## 이전 방식: Prisma Raw SQL (교체됨)

초기 구현은 `qp_home_notice_targets`와 `qp_home_notices`를 조인하여 역할별로 집계했다.

```ts
const overLimit = await tx.$queryRaw<{ role_code: string }[]>`
  SELECT hnt.role_code
  FROM qp_home_notice_targets hnt
  JOIN qp_home_notices hn ON hn.id = hnt.home_notice_id
  WHERE hnt.role_code IN (${Prisma.join(codesToCheck)})
    AND hn.id <> ${parsed.data}
    AND hn.start_at <= ${finalEndAt}
    AND hn.end_at   >= ${finalStartAt}
  GROUP BY hnt.role_code
  HAVING COUNT(DISTINCT hn.id) >= 5
  LIMIT 1
`;
```

### 장점 (참고)

- 조인·집계 조건과 `LIMIT 1`이 SQL로 명확하게 드러난다.
- `$queryRaw` 태그드 템플릿과 `Prisma.join`을 사용하므로 입력값은 파라미터 바인딩되어 SQL injection 위험이 없었다.
- 역할별 한도 확인을 단일 쿼리로 수행하여 역할 수만큼 조회하는 N+1 문제를 피했다.

## 동등성 근거

`HomeNoticeTarget`에는 `@@unique([homeNoticeId, roleCode])` 제약이 있다. 따라서 같은 공지와 역할 조합은 한 번만 존재한다.

이에 따라 역할별 `homeNoticeId` 개수는 기존 SQL의 `COUNT(DISTINCT hn.id)`와 동일하다. 즉, `groupBy`의 `homeNoticeId` 카운트로 역할별 공지 수를 안전하게 계산할 수 있다.

## 유지해야 할 조건

- 한도 검사와 공지 생성·수정은 현재처럼 `Serializable` 트랜잭션 안에서 수행해야 한다. 그렇지 않으면 동시 요청이 모두 한도 미만으로 판단하는 경쟁 조건이 생길 수 있다.
- `POST`, `PUT`의 구현 방식을 함께 통일해야 중복된 도메인 규칙의 표현이 달라지지 않는다.

## 결정

**ORM 일관성 및 모델 필드명 기반 유지보수성**을 우선하여 Prisma `groupBy` 방식을 채택했다 (2026-07-22 적용). 두 방식 모두 단일 집계 쿼리와 트랜잭션 격리 수준을 유지할 수 있으므로, 향후 복잡한 집계 SQL의 명시성이나 실행 계획 직접 제어가 필요해지면 Raw SQL로 되돌리는 것도 가능하다.
