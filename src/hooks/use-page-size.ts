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
 *   (응답 매핑: `value = code` 숫자 문자열, `label = codeName` 예 "20件")
 * - 실패 시 fallback 20/50/100 (회원관리 기준)
 * - 최초 디폴트: fallback 첫번째 값(20) — lazy init 으로 마운트 시점 1회만 평가,
 *   이후 API 옵션이 비동기 도착해도 pageSize 가 자동으로 바뀌지 않음(flicker 방지).
 * - setPageSize 는 양의 정수만 수용 (NaN·음수·0 차단).
 */
export function usePageSize() {
  const { data, isLoading } = useQuery({
    queryKey: ["common-code", "PAGE_SIZE"],
    queryFn: async (): Promise<SelectOption[]> => {
      const res = await api.get<{ data: CodeDetailApi[] }>("/codes/lookup", {
        params: { headerCode: "PAGE_SIZE" },
      });
      const details = res.data?.data;
      if (!Array.isArray(details)) return [];
      return details.map((d) => ({
        value: d.code,
        label: d.codeName,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const options = data ?? PAGE_SIZE_OPTIONS_FALLBACK;

  const [pageSize, setPageSizeRaw] = useState<number>(() => {
    return toPositiveInt(PAGE_SIZE_OPTIONS_FALLBACK[0]?.value) ?? 20;
  });

  const setPageSize = useCallback((next: number) => {
    if (Number.isFinite(next) && Number.isInteger(next) && next > 0) {
      setPageSizeRaw(next);
    }
  }, []);

  return { options, pageSize, setPageSize, isLoading };
}
