"use client";

import { useCallback, useEffect, useState } from "react";
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

const DEFAULT_PAGE_SIZE_WHEN_HIDDEN = 20;

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
 *   - 정렬: API 가 `sortOrder asc` 로 내려주므로 `options[0]` 이 항상 sort=1 항목
 *   - DB 계약 방어: `code` 가 양의 정수로 파싱되지 않는 항목은 옵션에서 제외
 * - **fallback 제거**: API 실패·빈 응답·헤더 비활성 시 options=[] 반환.
 *   소비측(PageSizeSelect 등) 이 빈 옵션을 보고 "-" 처리. 하드코딩 옵션 노출 금지.
 * - 기본 pageSize: 사용자가 PageSizeSelect 로 직접 변경하기 전까지 `options[0]` (sort=1) 사용.
 *   options 가 비어 있으면 `DEFAULT_PAGE_SIZE_WHEN_HIDDEN` (20) 으로 강제 — 그리드는
 *   항상 동작해야 하므로 안전 기본값을 유지하되 SelectBox 자체는 "-" 로 비활성.
 * - setPageSize: 양의 정수만 수용 (NaN·음수·0 차단)
 *
 * **storageKey (선택)**: 지정 시 사용자 선택값을 sessionStorage 에 영속해
 *   목록 → 상세 → 목록 왕복 시에도 직전 선택을 유지한다. 미지정 시 기존 동작
 *   (컴포넌트 unmount 시 초기화) 그대로 — 하위 호환.
 */
export function usePageSize(hookOptions?: { storageKey?: string }) {
  const storageKey = hookOptions?.storageKey;
  // 404(헤더 비활성/미등록) 는 에러가 아닌 정상 분기로 처리 — useQuery error 흐름을 타면
  // 콘솔 빨간 로그 + DevTools 빨강 표시가 떠 운영 노이즈가 발생한다. queryFn 내부에서
  // catch 해 `{ options: [], isHidden: true }` 로 변환하면 정상 data 로 흐른다.
  const { data, isLoading } = useQuery({
    queryKey: ["common-code", "PAGE_SIZE"],
    queryFn: async (): Promise<{ options: SelectOption[]; isHidden: boolean }> => {
      try {
        const res = await api.get<{ data: CodeDetailApi[] }>("/codes/lookup", {
          params: { headerCode: "PAGE_SIZE" },
        });
        const details = res.data?.data;
        if (!Array.isArray(details)) return { options: [], isHidden: false };
        const opts = details
          .filter((d) => toPositiveInt(d.code) !== null)
          .map((d) => ({ value: d.code, label: d.codeName }));
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

  const isHidden = data?.isHidden === true;

  // fallback 제거 — API 실패·빈 응답·헤더 비활성은 모두 options=[] 로 통일.
  const options = data?.options ?? [];

  // 사용자가 PageSizeSelect 로 직접 선택한 값. null 이면 미선택 상태 → options[0] (sort=1) 사용.
  // storageKey 지정 시 lazy init 으로 sessionStorage 에서 직전 선택값 복원.
  //   - SSR 환경(window 미존재)에서는 null 로 시작 → 클라이언트 하이드레이션 후 useEffect 에서
  //     보강하지 않는다 (set-state-in-effect 규칙 회피). SSR 첫 페인트는 sort=1 옵션이지만,
  //     pageSize 변경 즉시 sessionStorage 에 동기화되므로 다음 마운트부터는 lazy init 으로 복원됨.
  const [userSelected, setUserSelected] = useState<number | null>(() => {
    if (!storageKey) return null;
    if (typeof window === "undefined") return null;
    const stored = window.sessionStorage.getItem(storageKey);
    return toPositiveInt(stored);
  });

  // userSelected 변경 시 sessionStorage 동기화 (storageKey 지정 시에만).
  useEffect(() => {
    if (!storageKey) return;
    if (typeof window === "undefined") return;
    if (userSelected !== null) {
      window.sessionStorage.setItem(storageKey, String(userSelected));
    }
  }, [storageKey, userSelected]);

  // 사용자 선택값이 options 에 있으면 그 값, 아니면 options[0] (sort=1).
  // options 가 비어 있으면 그리드 동작 보장을 위해 DEFAULT (20) 강제 — 단 PageSizeSelect 는
  // options.length===0 을 감지해 "-" 비활성 렌더하므로 사용자에겐 fallback 미노출.
  const effectivePageSize =
    userSelected !== null && options.some((o) => Number(o.value) === userSelected)
      ? userSelected
      : toPositiveInt(options[0]?.value) ?? userSelected ?? DEFAULT_PAGE_SIZE_WHEN_HIDDEN;

  const setPageSize = useCallback((next: number) => {
    if (Number.isFinite(next) && Number.isInteger(next) && next > 0) {
      setUserSelected(next);
    }
  }, []);

  return { options, pageSize: effectivePageSize, setPageSize, isLoading, isHidden };
}
