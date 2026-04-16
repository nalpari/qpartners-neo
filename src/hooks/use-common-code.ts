"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";

interface CodeHeader {
  id: number;
  headerCode: string;
  headerName: string;
  isActive: boolean;
}

interface CodeDetail {
  code: string;
  displayCode: string;
  codeName: string;
  codeNameEtc: string | null;
  sortOrder: number;
}

/**
 * 공통코드 headerCode로 detail 목록을 조회하는 훅.
 * /api/codes에서 headerCode로 헤더 id를 찾고 → /api/codes/:id/details로 상세 조회.
 * SelectBox 옵션 형태({ value, label })로 변환하여 반환.
 */
export function useCommonCode(headerCode: string, fallback: { value: string; label: string }[] = []) {
  const { data: options = fallback, isLoading } = useQuery({
    queryKey: ["common-code", headerCode],
    queryFn: async () => {
      // 1. 헤더 목록에서 해당 headerCode의 id 조회
      const headersRes = await api.get<{ data: CodeHeader[] }>("/codes", {
        params: { keyword: headerCode, activeOnly: "true" },
      });
      const found = headersRes.data.data.find((h) => h.headerCode === headerCode);
      if (!found) return fallback;

      // 2. 해당 헤더의 detail 목록 조회
      const detailsRes = await api.get<{ data: CodeDetail[] }>(
        `/codes/${found.id}/details`,
        { params: { activeOnly: "true" } },
      );

      return detailsRes.data.data.map((d) => ({
        value: d.displayCode,
        label: d.codeName,
      }));
    },
    staleTime: Infinity,
  });

  return { options, isLoading };
}
