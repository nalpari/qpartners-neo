"use client";

// Design Ref: §3.2 — 검색 state 관리 + 하위 컴포넌트 연결

import { useEffect, useState } from "react";
import {
  consumeListRestoreFlag,
  LIST_RESTORE_KEYS,
  useListStateCacheInvalidator,
} from "@/hooks/use-list-state-persist";
import { BulkMailSearch } from "./bulk-mail-search";
import { BulkMailTable } from "./bulk-mail-table";
import type { MassMailSearchParams } from "./bulk-mail-types";

/**
 * sessionStorage 의 직렬화된 검색조건을 안전하게 역직렬화.
 * 스키마 변동/JSON 손상 등 어떤 경우에도 throw 하지 않고 빈 객체로 폴백.
 */
function parseStoredSearchParams(raw: string | null): MassMailSearchParams {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as MassMailSearchParams;
    }
    return {};
  } catch {
    return {};
  }
}

/** searchParams 가 사실상 비어있는지 (모든 값이 undefined/빈 문자열) 판정 */
function isEmptySearchParams(params: MassMailSearchParams): boolean {
  return Object.values(params).every((v) => v === undefined || v === "");
}

export function BulkMailContents() {
  // 마운트 시 1회 — sessionStorage 복원 플래그 소비.
  //   - 상세/생성 → 목록 복귀: 플래그 "1" → true (직전 검색조건/페이지 표시 개수 복원)
  //   - 그 외 진입(메뉴 클릭, 새로고침, 다른 페이지 경유): false (sessionStorage 삭제, 초기화)
  // useState lazy init 으로 컴포넌트 첫 렌더 시 정확히 1회 평가 → 하위 props 로 전달.
  const [shouldRestoreList] = useState(() => consumeListRestoreFlag("bulkMail"));
  // 컴포넌트 unmount 시 cache 무효화 — 다른 페이지 다녀온 후 다시 진입할 때 stale 한
  // true 값이 그대로 남아 잘못 복원되던 회귀 차단.
  useListStateCacheInvalidator("bulkMail");

  // searchParams 초기값:
  //   - shouldRestoreList === true → sessionStorage 의 직렬화된 값 복원
  //   - false → sessionStorage 즉시 삭제 + 빈 객체로 시작
  // 같은 useState lazy init 안에서 sessionStorage 부수효과 수행 (마운트 1회).
  const [searchParams, setSearchParams] = useState<MassMailSearchParams>(() => {
    if (typeof window === "undefined") return {};
    const FILTERS_KEY = LIST_RESTORE_KEYS.bulkMail.filters;
    if (shouldRestoreList) {
      return parseStoredSearchParams(window.sessionStorage.getItem(FILTERS_KEY));
    }
    window.sessionStorage.removeItem(FILTERS_KEY);
    return {};
  });

  // 검색 시 Table 리마운트로 페이지 리셋 (React Compiler 호환 — useEffect+setState 대신 key 방식)
  const [searchKey, setSearchKey] = useState(0);

  // searchParams 변경 시 sessionStorage 동기화.
  //   - 비어있으면 삭제 — 초기화 버튼 후 이전 검색조건이 부활하는 회귀 방지.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const FILTERS_KEY = LIST_RESTORE_KEYS.bulkMail.filters;
    if (isEmptySearchParams(searchParams)) {
      window.sessionStorage.removeItem(FILTERS_KEY);
    } else {
      window.sessionStorage.setItem(FILTERS_KEY, JSON.stringify(searchParams));
    }
  }, [searchParams]);

  const handleSearch = (params: MassMailSearchParams) => {
    setSearchParams(params);
    setSearchKey((prev) => prev + 1);
  };

  const handleReset = () => {
    setSearchParams({});
    setSearchKey((prev) => prev + 1);
  };

  return (
    <main className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      {/* 복원 시 폼 state 가 초기값으로 동기화되도록 key 로 리마운트 제어
          (react-hooks/set-state-in-effect 정책 — 부모에서 key prop 으로 리마운트 권장 패턴) */}
      <BulkMailSearch
        key={`mount-${shouldRestoreList ? "restore" : "fresh"}`}
        initialValues={searchParams}
        onSearch={handleSearch}
        onReset={handleReset}
      />
      <BulkMailTable
        key={searchKey}
        searchParams={searchParams}
        shouldRestore={shouldRestoreList}
      />
    </main>
  );
}
