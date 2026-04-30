"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";

interface CodeDetailApi {
  code: string;
  displayCode: string;
  codeName: string;
  codeNameEtc: string | null;
  sortOrder: number;
}

type SelectOption = { value: string; label: string };

/**
 * USER_TYPE 공통코드 조회 + 회원유형 SelectBox 옵션·역매핑 제공.
 *
 * - 옵션 소스: `/api/codes/lookup?headerCode=USER_TYPE`
 *   매핑: `value = code` (예 "ADMIN"), `label = codeName` (예 "管理者")
 * - 검색 SelectBox 용 `searchOptions` 는 옵션 존재 시 선두에 「全体(value="")」 prepend.
 * - 백엔드의 회원 응답이 `userType` 을 일본어 라벨로 내려주므로, 라벨 → 영문 코드
 *   `reverseMap` 도 함께 제공 (popup 진입용).
 *
 * - **fallback 제거**: 헤더 비활성/미등록(404) 또는 빈 옵션 시 `searchOptions=[]`,
 *   `reverseMap={}` 반환. 소비측이 "-" 비활성 처리. 하드코딩 옵션·매핑 노출 금지.
 */
export function useUserType() {
  const { data, isLoading } = useQuery({
    queryKey: ["common-code", "USER_TYPE"],
    queryFn: async (): Promise<{ options: SelectOption[]; isHidden: boolean }> => {
      try {
        const res = await api.get<{ data: CodeDetailApi[] }>("/codes/lookup", {
          params: { headerCode: "USER_TYPE" },
        });
        const details = res.data?.data;
        if (!Array.isArray(details)) return { options: [], isHidden: false };
        const opts = details.map((d) => ({ value: d.code, label: d.codeName }));
        return { options: opts, isHidden: false };
      } catch (err: unknown) {
        if (isAxiosError(err) && err.response?.status === 404) {
          return { options: [], isHidden: true };
        }
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // 검색용 옵션 — 옵션 존재 시 「全体」 prepend, 없으면 빈 배열 (소비측이 "-" 비활성 렌더).
  const searchOptions = useMemo<SelectOption[]>(() => {
    if (!data?.options || data.options.length === 0) return [];
    return [{ value: "", label: "全体" }, ...data.options];
  }, [data]);

  // 일본어 라벨 → 영문 코드 역매핑. 옵션 부재 시 빈 객체 — 소비측이 매핑 실패를 감지해
  // popup 진입 차단 / "-" 표기로 폴백한다 (하드코딩 매핑 사용 금지).
  const reverseMap = useMemo<Record<string, string>>(() => {
    if (!data?.options || data.options.length === 0) return {};
    return Object.fromEntries(data.options.map((o) => [o.label, o.value]));
  }, [data]);

  return { searchOptions, reverseMap, isLoading };
}
