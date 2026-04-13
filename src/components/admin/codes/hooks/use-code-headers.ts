"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { codeHeaderListResponseSchema } from "@/lib/schemas/code";
import type { CodeHeaderResponse, HeaderGridRow } from "../codes-types";
import { EMPTY_HEADER_FIELDS } from "../codes-types";

/**
 * Header Code 데이터·검색·신규행 관리를 캡슐화한 훅.
 *
 * Responsibility:
 * - Header 목록 fetch (응답 safeParse 검증)
 * - 검색 키워드 / activeOnly 필터 state
 * - Header 신규행 state + 등록 mutation
 *   - create mutation의 onSuccess는 query invalidate + 신규행 state/ref 정리까지 수행
 * - 검색/리셋/추가/취소 핸들러
 *
 * 실패 경로 설계:
 * - mutation 실패 시 신규행 state는 정리하지 않고 그대로 유지 (retry-friendly)
 */
export function useCodeHeaders() {
  const queryClient = useQueryClient();

  // 검색·필터 state
  const [searchKeyword, setSearchKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [headerActiveOnly, setHeaderActiveOnly] = useState(false);

  // 신규행 state
  const [headerNewRow, setHeaderNewRow] = useState<HeaderGridRow | null>(null);
  const headerNewRowRef = useRef<Record<string, string>>({ ...EMPTY_HEADER_FIELDS });

  // Header 목록 query — queryKey prefix 분리, 응답 safeParse 검증
  const { data: headersRaw = [], isLoading: headersLoading, isError: headersError } = useQuery<CodeHeaderResponse[]>({
    queryKey: ["codes", "headers", { keyword: appliedKeyword, activeOnly: headerActiveOnly }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (appliedKeyword) params.set("keyword", appliedKeyword);
      params.set("activeOnly", String(headerActiveOnly));
      const res = await api.get<unknown>(`/codes?${params}`);
      const parsed = codeHeaderListResponseSchema.safeParse(res.data);
      if (!parsed.success) {
        console.error("[useCodeHeaders] 응답 스키마 불일치:", parsed.error.issues);
        throw new Error("外部サーバーの応答を処理できません");
      }
      return parsed.data.data;
    },
  });

  // Header 등록 mutation
  const headerCreateMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const body = {
        headerCode: data.headerCode,
        headerAlias: data.headerAlias,
        headerName: data.headerName,
        relCode1: data.relCode1 || null,
        relCode2: data.relCode2 || null,
        relCode3: data.relCode3 || null,
        relNum1: data.relNum1 || null,
        relNum2: data.relNum2 || null,
        relNum3: data.relNum3 || null,
      };
      return api.post("/codes", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["codes", "headers"] });
      setHeaderNewRow(null);
      headerNewRowRef.current = { ...EMPTY_HEADER_FIELDS };
    },
  });

  const handleSearch = useCallback(() => setAppliedKeyword(searchKeyword), [searchKeyword]);

  const handleReset = useCallback(() => {
    setSearchKeyword("");
    setAppliedKeyword("");
  }, []);

  const handleHeaderAdd = useCallback(() => {
    if (headerNewRow) return;
    headerNewRowRef.current = { ...EMPTY_HEADER_FIELDS };
    setHeaderNewRow({
      id: `new-${Date.now()}`,
      headerCode: "",
      headerAlias: "",
      headerName: "",
      relCode1: "",
      relCode2: "",
      relCode3: "",
      relNum1: "",
      relNum2: "",
      relNum3: "",
      isActive: "Y",
      isNew: true,
    });
  }, [headerNewRow]);

  const handleHeaderCancelAdd = useCallback(() => {
    setHeaderNewRow(null);
    headerNewRowRef.current = { ...EMPTY_HEADER_FIELDS };
  }, []);

  const handleHeaderNewRowFieldChange = useCallback((field: string, value: string) => {
    headerNewRowRef.current[field] = value;
  }, []);

  return {
    // 검색·필터
    searchKeyword,
    setSearchKeyword,
    headerActiveOnly,
    setHeaderActiveOnly,
    // 쿼리 결과
    headersRaw,
    headersLoading,
    headersError,
    // 신규행
    headerNewRow,
    headerNewRowRef,
    // 핸들러
    handleSearch,
    handleReset,
    handleHeaderAdd,
    handleHeaderCancelAdd,
    handleHeaderNewRowFieldChange,
    // mutation (handleSave에서 사용)
    headerCreateMutation,
  };
}
