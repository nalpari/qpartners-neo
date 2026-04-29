"use client";

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
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
 *   - DB 계약 방어: `code` 가 양의 정수로 파싱되지 않는 항목은 옵션에서 제외
 *     (운영자가 비숫자 코드를 등록하거나 스키마 계약이 바뀌어도 placeholder 유출 차단)
 * - 옵션 fallback: 회원관리 기준 20/50/100 (공통코드 조회 실패·빈 응답 시)
 * - 초기 pageSize: `initial` 파라미터 (기본 20) — 화면별 기본 표시량 커스터마이즈 가능
 *   (예: 대량메일 목록은 `usePageSize(100)` 으로 100건 기본)
 * - Value-options 정합성: 현재 pageSize 가 options 에 없으면 options 첫번째로 보정하여
 *   SelectBox placeholder 노출 방지 (state 는 그대로, 렌더값만 보정)
 * - setPageSize: 양의 정수만 수용 (NaN·음수·0 차단)
 *
 * # isHidden — Header 비활성/미등록 신호
 * lookup API 는 PAGE_SIZE 헤더가 isActive=false 또는 미등록일 때 404 를 응답한다.
 * 이 신호를 받아 `isHidden=true` 로 노출 → 소비측(PageSizeSelect) 이 자기 자신을 숨김.
 * 숨김 상태에서는 pageSize 를 20 으로 강제 고정해 그리드가 항상 일관된 기본값으로 동작.
 */
export function usePageSize(initial: number = 20) {
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

  const options = isHidden
    ? []
    : data?.options && data.options.length > 0
      ? data.options
      : PAGE_SIZE_OPTIONS_FALLBACK;

  const [pageSize, setPageSizeRaw] = useState<number>(() => {
    return Number.isFinite(initial) && Number.isInteger(initial) && initial > 0
      ? initial
      : 20;
  });

  // hidden 이면 무조건 20 으로 강제. 아니면 options 정합성 보정 후 사용.
  const effectivePageSize = isHidden
    ? DEFAULT_PAGE_SIZE_WHEN_HIDDEN
    : options.some((o) => Number(o.value) === pageSize)
      ? pageSize
      : toPositiveInt(options[0]?.value) ?? pageSize;

  const setPageSize = useCallback((next: number) => {
    if (Number.isFinite(next) && Number.isInteger(next) && next > 0) {
      setPageSizeRaw(next);
    }
  }, []);

  return { options, pageSize: effectivePageSize, setPageSize, isLoading, isHidden };
}
