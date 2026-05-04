"use client";

import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";

import api from "@/lib/axios";

/**
 * 콘텐츠 게시대상 권한명 라벨 훅.
 *
 * 정책:
 * - `/api/role-labels` 에서 권한관리(`QpRole`)의 roleCode/roleName/isActive 를 받아와
 *   `targetType`(`first_store` 등) 키 기준으로 정규화한다.
 * - 비회원(`non_member`)은 권한관리 대상 아님 → 항상 고정 라벨 사용.
 * - API 미응답/지연 시에는 정적 fallback 라벨을 사용해 화면 깨짐을 방지.
 * - staleTime 5분: 권한명은 빈번히 바뀌지 않으므로 콘텐츠 페이지 전반에서 공유.
 */

interface RoleLabelApiItem {
  roleCode: string;
  roleName: string;
  isActive: boolean;
  targetType: string;
}

interface RoleLabelsResponse {
  data: RoleLabelApiItem[];
}

/** API 미응답/지연 시 fallback 라벨 — 디자인 안 일본어 표기 */
const FALLBACK_LABELS: Record<string, string> = {
  first_store: "1次販売店",
  second_store: "2次以降の販売店",
  seko: "施工店",
  general: "一般",
  non_member: "非会員",
};

/** 비회원 라벨 (권한관리 미관리 — 항상 고정) */
const NON_MEMBER_LABEL = "非会員";

/** 게시대상 표시 순서 — 1차 → 2차 → 시공점 → 일반 → 비회원 */
const TARGET_TYPE_ORDER: Record<string, number> = {
  first_store: 1,
  second_store: 2,
  seko: 3,
  general: 4,
  non_member: 5,
};

const ALL_TARGET_TYPES = [
  "first_store",
  "second_store",
  "seko",
  "general",
  "non_member",
] as const;

export interface TargetTypeOption {
  /** ContentTarget.targetType 값 — DB 식별자 */
  value: string;
  /** 권한관리에서 설정한 권한명 (fallback 정적 라벨) */
  label: string;
  /** 사용가능여부 — 권한관리 isActive=Y 만 옵션 노출용. 비회원은 항상 true. */
  isActive: boolean;
  /** 권한코드 — 비회원은 null (권한관리 대상 아님) */
  roleCode: string | null;
}

export function useTargetLabels() {
  const { data, isLoading } = useQuery({
    queryKey: ["role-labels"],
    queryFn: async () => {
      const res = await api.get<RoleLabelsResponse>("/role-labels");
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  return useMemo(() => {
    const byTargetType = new Map<string, RoleLabelApiItem>();
    for (const r of data ?? []) byTargetType.set(r.targetType, r);

    const resolveLabel = (targetType: string): string => {
      if (targetType === "non_member") return NON_MEMBER_LABEL;
      return (
        byTargetType.get(targetType)?.roleName ??
        FALLBACK_LABELS[targetType] ??
        targetType
      );
    };

    const isAvailable = (targetType: string): boolean => {
      if (targetType === "non_member") return true;
      // 데이터 미수신 시 비활성 — 로딩 완료 전 비활성 옵션 일시 노출 방지 (fail-closed)
      return byTargetType.get(targetType)?.isActive ?? false;
    };

    const getRoleCode = (targetType: string): string | null => {
      if (targetType === "non_member") return null;
      return byTargetType.get(targetType)?.roleCode ?? null;
    };

    /**
     * 모든 게시대상 옵션 (등록/표시용 — 정적 순서 보장).
     * 비회원 포함, 비활성도 포함 (옵션 노출 필터는 컴포넌트에서 isActive 로 결정).
     */
    const allOptions: TargetTypeOption[] = ALL_TARGET_TYPES.map((tt) => ({
      value: tt,
      label: resolveLabel(tt),
      isActive: isAvailable(tt),
      roleCode: getRoleCode(tt),
    }));

    /** @deprecated getAllOptions() 대신 allOptions 배열 직접 참조 권장 */
    const getAllOptions = (): TargetTypeOption[] => allOptions;

    /** 표시 순서 정렬 (cellRenderer 등에서 사용) */
    const sortByOrder = <T extends { targetType: string }>(
      targets: readonly T[],
    ): T[] =>
      [...targets].sort(
        (a, b) =>
          (TARGET_TYPE_ORDER[a.targetType] ?? 99) -
          (TARGET_TYPE_ORDER[b.targetType] ?? 99),
      );

    return {
      resolveLabel,
      isAvailable,
      getRoleCode,
      getAllOptions,
      allOptions,
      sortByOrder,
      isLoading,
    };
  }, [data, isLoading]);
}
