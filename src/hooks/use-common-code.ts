"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";

interface CodeDetail {
  code: string;
  displayCode: string;
  codeName: string;
  codeNameEtc: string | null;
  sortOrder: number;
}

type SelectOption = { value: string; label: string };

/**
 * 공통코드 headerCode 로 detail 목록을 조회하는 훅.
 * 공개 엔드포인트 `/api/codes/lookup` 를 단일 호출 (비로그인 사용자도 접근 가능).
 * SelectBox 옵션 형태({ value, label })로 변환하여 반환.
 */
export function useCommonCode(headerCode: string, fallback: SelectOption[] = []) {
  const { data, isLoading } = useQuery({
    queryKey: ["common-code", headerCode],
    queryFn: async (): Promise<SelectOption[]> => {
      const res = await api.get<{ data: CodeDetail[] }>("/codes/lookup", {
        params: { headerCode },
      });
      const details = res.data?.data;
      if (!Array.isArray(details)) return [];
      return details.map((d) => ({
        value: d.displayCode,
        label: d.codeName,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  return { options: data ?? fallback, isLoading };
}
