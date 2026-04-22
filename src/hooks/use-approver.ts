"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";

interface CodeDetailApi {
  code: string;
  displayCode: string;
  codeName: string;
  codeNameEtc: string | null;
  sortOrder: number;
}

interface ApproverOption {
  value: string;
  label: string;
}

/**
 * APPROVER 공통코드 조회 훅.
 * - 소스: `/api/codes/lookup?headerCode=APPROVER`
 * - 매핑: `value = code`, `label = codeName`
 * - 옵션 배열(폼 SelectBox 용) + 라벨 맵(상세 화면 approverLevel 변환용) 동시 제공
 * - staleTime 5분 — 공통코드는 자주 바뀌지 않음
 */
export function useApprover() {
  const { data, isLoading } = useQuery({
    queryKey: ["common-code", "APPROVER"],
    queryFn: async (): Promise<CodeDetailApi[]> => {
      const res = await api.get<{ data: CodeDetailApi[] }>("/codes/lookup", {
        params: { headerCode: "APPROVER" },
      });
      return Array.isArray(res.data?.data) ? res.data.data : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const options = useMemo<ApproverOption[]>(() => {
    if (!data || data.length === 0) return [];
    return data.map((d) => ({ value: d.code, label: d.codeName }));
  }, [data]);

  const labelMap = useMemo<Record<number, string>>(() => {
    if (!data) return {};
    const map: Record<number, string> = {};
    for (const d of data) {
      const n = Number(d.code);
      if (Number.isFinite(n) && Number.isInteger(n)) {
        map[n] = d.codeName;
      }
    }
    return map;
  }, [data]);

  return { options, labelMap, isLoading };
}
