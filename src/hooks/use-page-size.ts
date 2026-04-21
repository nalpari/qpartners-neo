"use client";

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { PAGE_SIZE_OPTIONS_FALLBACK } from "@/lib/constants";

interface CodeDetailApi {
  code: string;
  displayCode: string;
  codeName: string;
  codeNameEtc: string | null;
  sortOrder: number;
}

type SelectOption = { value: string; label: string };

/** 양의 정수로 파싱 가능한 경우만 number 반환, 아니면 null */
function toPositiveInt(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * PAGE_SIZE 공통코드 조회 + 선택 state 관리 훅.
 * - 옵션 소스: `/api/codes/lookup?headerCode=PAGE_SIZE`
 *   - 매핑: `value = code`, `label = codeName` (예 `"20件"`)
 *   - DB 계약 방어: `code` 가 양의 정수로 파싱되지 않는 항목은 옵션에서 제외
 *     (운영자가 비숫자 코드를 등록하거나 스키마 계약이 바뀌어도 placeholder 유출 차단)
 * - 옵션 fallback: 회원관리 기준 20/50/100 (공통코드 조회 실패·빈 응답 시)
 * - 초기 pageSize: `initial` 파라미터 (기본 20) — 화면별 기본 표시량 커스터마이즈 가능
 *   (예: 대량메일 목록은 `usePageSize(100)` 으로 100건 기본)
 * - Value-options 정합성: 현재 pageSize 가 options 에 없으면 options 첫번째로 보정하여
 *   SelectBox placeholder 노출 방지 (state 는 그대로, 렌더값만 보정)
 * - setPageSize: 양의 정수만 수용 (NaN·음수·0 차단)
 */
export function usePageSize(initial: number = 20) {
  const { data, isLoading } = useQuery({
    queryKey: ["common-code", "PAGE_SIZE"],
    queryFn: async (): Promise<SelectOption[]> => {
      const res = await api.get<{ data: CodeDetailApi[] }>("/codes/lookup", {
        params: { headerCode: "PAGE_SIZE" },
      });
      const details = res.data?.data;
      if (!Array.isArray(details)) return [];
      return details
        .filter((d) => toPositiveInt(d.code) !== null)
        .map((d) => ({
          value: d.code,
          label: d.codeName,
        }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const options = data && data.length > 0 ? data : PAGE_SIZE_OPTIONS_FALLBACK;

  const [pageSize, setPageSizeRaw] = useState<number>(() => {
    return Number.isFinite(initial) && Number.isInteger(initial) && initial > 0
      ? initial
      : 20;
  });

  // options 갱신 후 현재 pageSize 가 범위 밖이면 options 첫번째로 보정하여 렌더
  // (state 원값은 유지 — options 가 나중에 복구되면 원값 다시 유효)
  const effectivePageSize = options.some((o) => Number(o.value) === pageSize)
    ? pageSize
    : toPositiveInt(options[0]?.value) ?? pageSize;

  const setPageSize = useCallback((next: number) => {
    if (Number.isFinite(next) && Number.isInteger(next) && next > 0) {
      setPageSizeRaw(next);
    }
  }, []);

  return { options, pageSize: effectivePageSize, setPageSize, isLoading };
}
