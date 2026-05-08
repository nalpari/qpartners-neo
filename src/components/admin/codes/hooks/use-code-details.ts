"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { codeDetailListResponseSchema } from "@/lib/schemas/code";
import type { CodeDetailResponse, DetailGridRow } from "../codes-types";
import { EMPTY_DETAIL_FIELDS } from "../codes-types";

interface UseCodeDetailsOptions {
  selectedHeaderId: number | null;
  selectedHeaderCode: string;
  selectedHeaderAlias: string;
}

/**
 * 선택된 Header의 Detail 데이터·신규행·mutation을 캡슐화한 훅.
 *
 * Responsibility:
 * - `selectedHeaderId` 기반 Detail 목록 fetch (Number.isFinite 가드 + safeParse 검증)
 * - Detail activeOnly 필터 state
 * - Detail 신규행 state + 등록 mutation
 *   - create mutation의 onSuccess는 query invalidate + 신규행 state/ref 정리까지 수행
 * - Detail 편집 update mutation
 *   - update mutation의 onSuccess는 query invalidate만 수행
 *   - editingCell / detailEditRef 정리는 호출측(handleSave)의 책임
 * - 추가/취소/리셋 핸들러
 *
 * 실패 경로 설계:
 * - mutation 실패 시 신규행 state는 정리하지 않고 그대로 유지 (retry-friendly)
 * - 호출측이 에러 alert를 띄운 뒤 같은 행을 재시도 가능
 */
export function useCodeDetails({ selectedHeaderId, selectedHeaderCode, selectedHeaderAlias }: UseCodeDetailsOptions) {
  const queryClient = useQueryClient();

  const [detailActiveOnly, setDetailActiveOnly] = useState(true);
  const [detailNewRow, setDetailNewRow] = useState<DetailGridRow | null>(null);
  const detailNewRowRef = useRef<Record<string, string>>({ ...EMPTY_DETAIL_FIELDS });

  // Detail 목록 query — queryKey prefix 분리, enabled 가드, 응답 safeParse 검증
  const { data: detailsRaw = [], isLoading: detailsLoading, isError: detailsError } = useQuery<CodeDetailResponse[]>({
    queryKey: ["codes", "details", selectedHeaderId, { activeOnly: detailActiveOnly }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("activeOnly", String(detailActiveOnly));
      const res = await api.get<unknown>(`/codes/${selectedHeaderId}/details?${params}`);
      const parsed = codeDetailListResponseSchema.safeParse(res.data);
      if (!parsed.success) {
        console.error("[useCodeDetails] 응답 스키마 불일치:", parsed.error.issues);
        throw new Error("外部サーバーの応答を処理できません");
      }
      return parsed.data.data;
    },
    enabled: selectedHeaderId !== null && Number.isFinite(selectedHeaderId),
  });

  // Detail 등록 mutation
  // isActive는 클라이언트에서 전송하지 않고 서버 Zod 기본값(.default(true))에 위임 — 신규 코드는 활성 상태로 생성
  // relNum1 은 Detail UI 에서 deprecated 됐지만 BE 스키마에는 살아있어 명시적 null 로 전송한다.
  const detailCreateMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const body = {
        code: data.code,
        displayCode: data.displayCode,
        codeName: data.codeName,
        codeNameEtc: data.codeNameEtc || null,
        relCode1: data.relCode1 || null,
        relCode2: data.relCode2 || null,
        relCode3: data.relCode3 || null,
        relNum1: null,
        sortOrder: data.sortOrder ? Number(data.sortOrder) : 0,
      };
      return api.post(`/codes/${selectedHeaderId}/details`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["codes", "details", selectedHeaderId] });
      // lookup 소비처(usePageSize 등)도 즉시 갱신되도록 ["common-code"] 캐시 무효화.
      queryClient.invalidateQueries({ queryKey: ["common-code"] });
      setDetailNewRow(null);
      detailNewRowRef.current = { ...EMPTY_DETAIL_FIELDS };
    },
  });

  // Detail 수정 mutation
  // onSuccess는 query invalidate만 수행 — editingCell/detailEditRef 정리는 호출측(handleSave)에서 담당
  const detailUpdateMutation = useMutation({
    mutationFn: async ({ detailId, data }: { detailId: number; data: Record<string, unknown> }) => {
      return api.put(`/codes/${selectedHeaderId}/details/${detailId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["codes", "details", selectedHeaderId] });
      // 디테일 isActive 토글이나 codeName 변경이 즉시 PageSizeSelect 등 lookup 소비처에
      // 반영되도록 공통코드 캐시 무효화.
      queryClient.invalidateQueries({ queryKey: ["common-code"] });
    },
  });

  // displayCode 자동 생성 가능 여부 — prefix 가 영문 3자리일 때만 발급. CodesContents 가
  // 「追加」 버튼 disabled / 안내 alert 분기에 사용한다.
  const canAddDetail = /^[A-Z]{3}$/.test(selectedHeaderAlias.toUpperCase());

  const handleDetailAdd = useCallback(() => {
    if (detailNewRow || !selectedHeaderId) return;
    // headerAlias 미설정/비정상 → 자동 displayCode 발급 불가 → 추가 차단 (방어층).
    // CodesContents 의 wrapping handler 가 사용자에게 안내 alert 노출.
    const prefix = selectedHeaderAlias.toUpperCase();
    if (!/^[A-Z]{3}$/.test(prefix)) return;

    // 기본 sortOrder: 현재 detailsRaw 중 max(sortOrder) + 1 (append 의도).
    // BE 가 자동 shift 하므로 충돌해도 안전하지만, 끝번호로 두면 무의미한 shift 회피 + UX 명확.
    const maxSort = detailsRaw.reduce((acc, d) => Math.max(acc, d.sortOrder), 0);
    const nextSort = maxSort + 1;

    // displayCode 자동 생성 — `<prefix><3자리 seq>` 정확 매칭으로 maxSeq 추출.
    // startsWith 부분 매칭은 alias 축소(USR→US)·legacy 4자리 seq 등에서 NaN/오버플로 위험.
    const seqPattern = new RegExp(`^${prefix}(\\d{3})$`);
    let maxSeq = 0;
    for (const d of detailsRaw) {
      const m = seqPattern.exec(d.displayCode);
      if (!m) continue;
      const seq = Number(m[1]);
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }
    const nextSeq = maxSeq + 1;

    // 999 상한 — 사양상 "3자리 seq" 보장. 초과 시 빈 displayCode 로 두면 handleSave
    // 신규행 검증(displayCode 필수)에서 막혀 사용자에게 명확한 alert 노출.
    const autoDisplayCode = nextSeq > 999 ? "" : `${prefix}${String(nextSeq).padStart(3, "0")}`;

    detailNewRowRef.current = { ...EMPTY_DETAIL_FIELDS, sortOrder: String(nextSort), displayCode: autoDisplayCode };
    setDetailNewRow({
      id: `new-${Date.now()}`,
      headerId: String(selectedHeaderId),
      headerCode: selectedHeaderCode,
      code: "",
      displayCode: autoDisplayCode,
      codeName: "",
      codeNameEtc: "",
      relCode1: "",
      relCode2: "",
      relCode3: "",
      sortOrder: nextSort,
      isActive: "Y",
      isNew: true,
    });
  }, [detailNewRow, selectedHeaderId, selectedHeaderCode, selectedHeaderAlias, detailsRaw]);

  const handleDetailCancelAdd = useCallback(() => {
    setDetailNewRow(null);
    detailNewRowRef.current = { ...EMPTY_DETAIL_FIELDS };
  }, []);

  // Header 전환 시 호출되는 리셋 — 신규행 state와 ref를 모두 초기화
  const resetDetailNewRow = useCallback(() => {
    setDetailNewRow(null);
    detailNewRowRef.current = { ...EMPTY_DETAIL_FIELDS };
  }, []);

  const handleDetailNewRowFieldChange = useCallback((field: string, value: string) => {
    detailNewRowRef.current[field] = value;
  }, []);

  return {
    // 쿼리 결과
    detailsRaw,
    detailsLoading,
    detailsError,
    // 필터
    detailActiveOnly,
    setDetailActiveOnly,
    // 신규행
    detailNewRow,
    detailNewRowRef,
    // 가드 — CodesContents 가 「追加」 버튼 disabled / 안내 alert 분기에 사용
    canAddDetail,
    // 핸들러
    handleDetailAdd,
    handleDetailCancelAdd,
    handleDetailNewRowFieldChange,
    resetDetailNewRow,
    // mutations (handleSave에서 사용)
    detailCreateMutation,
    detailUpdateMutation,
  };
}
