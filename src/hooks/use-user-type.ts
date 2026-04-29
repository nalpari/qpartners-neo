"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { MEMBER_TYPE_OPTIONS } from "@/components/admin/members/members-types";

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
 * - 검색 SelectBox 용 `options` 는 선두에 「全体(value="")」 항목 자동 부착
 * - 백엔드의 회원 응답이 `userType` 을 일본어 라벨로 내려주므로, 이 라벨을
 *   userTp 영문 코드로 되돌리는 `reverseMap` 도 함께 제공 (popup 진입용)
 * - 헤더 비활성/미등록(404) 또는 빈 옵션 시 `MEMBER_TYPE_OPTIONS` fallback 사용
 *   → 외부 데이터 부재에도 회원관리 화면이 정상 동작
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

  // 검색용 옵션 — fallback 또는 동적 옵션 + 「全体」 prepend.
  // hidden 여도 회원관리 검색은 동작해야 하므로 hardcoded fallback 으로 폴백.
  const searchOptions = useMemo<SelectOption[]>(() => {
    const fallback = [...MEMBER_TYPE_OPTIONS] as SelectOption[];
    if (!data?.options || data.options.length === 0) return fallback;
    return [{ value: "", label: "全体" }, ...data.options];
  }, [data]);

  // 일본어 라벨 → 영문 코드 역매핑. 동적 옵션 우선, 부재 시 hardcoded fallback.
  const reverseMap = useMemo<Record<string, string>>(() => {
    if (data?.options && data.options.length > 0) {
      return Object.fromEntries(data.options.map((o) => [o.label, o.value]));
    }
    return {
      "管理者": "ADMIN",
      "販売店": "STORE",
      "施工店": "SEKO",
      "一般": "GENERAL",
    };
  }, [data]);

  return { searchOptions, reverseMap, isLoading };
}
