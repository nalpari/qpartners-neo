"use client";

import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";

import api from "@/lib/axios";
import { targetOrderRank } from "@/lib/target-role-order";

/**
 * 콘텐츠 게시대상 / 홈공지 / 대량메일 / 권한관리 공용 라벨 훅.
 *
 * 정책 (Target Dynamic from Role 후):
 * - `/api/role-labels` 에서 권한관리(`QpRole`) 의 roleCode/roleName/isActive/isSystem 동적 조회.
 * - 6 기본 + 운영자 정의 추가 권한 모두 처리.
 * - 비회원(roleCode=null) 은 권한관리 외부 sentinel — 항상 고정 라벨 / 활성.
 * - staleTime 5분.
 */

interface RoleLabelApiItem {
  roleCode: string;
  roleName: string;
  isActive: boolean;
  isSystem: boolean;
}

interface RoleLabelsResponse {
  data: RoleLabelApiItem[];
}

/** 비회원 라벨 (권한관리 외부 sentinel — 항상 고정) */
const NON_MEMBER_LABEL = "非会員";

/**
 * 콘텐츠 게시대상(등록 폼 / 검색조건) 노출 제외 권한 코드.
 * 사내회원(SUPER_ADMIN / ADMIN)은 게시대상과 무관하게 항상 콘텐츠 조회가 가능하므로
 * 게시대상 선택지에서 제외한다. 권한관리 / 홈공지 / 대량메일 등 다른 화면은 영향 없음.
 */
const ROLE_CODES_HIDDEN_FROM_CONTENT_TARGET: ReadonlySet<string> = new Set([
  "SUPER_ADMIN",
  "ADMIN",
]);

export interface TargetRoleOption {
  /** roleCode — null = 비회원 sentinel */
  roleCode: string | null;
  /** 권한관리 roleName 또는 비회원 라벨 */
  label: string;
  /** isActive — 비회원은 항상 true */
  isActive: boolean;
  /** isSystem — 6 기본 권한 여부 (비회원은 true) */
  isSystem: boolean;
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
    const byCode = new Map<string, RoleLabelApiItem>();
    for (const r of data ?? []) byCode.set(r.roleCode, r);

    /** roleCode (null = 비회원) → 라벨 */
    const resolveLabel = (roleCode: string | null): string => {
      if (roleCode === null) return NON_MEMBER_LABEL;
      return byCode.get(roleCode)?.roleName ?? roleCode;
    };

    /** roleCode (null = 비회원) → 사용 가능 여부 */
    const isAvailable = (roleCode: string | null): boolean => {
      if (roleCode === null) return true;
      return byCode.get(roleCode)?.isActive ?? false;
    };

    /** 활성 옵션 (member 대상) — 홈공지/대량메일/회원관리/검색 필터용. 비회원 제외. */
    const memberOptions: TargetRoleOption[] = (data ?? [])
      .filter((r) => r.isActive)
      .map((r) => ({
        roleCode: r.roleCode,
        label: r.roleName,
        isActive: true,
        isSystem: r.isSystem,
      }))
      .sort((a, b) => {
        const ra = targetOrderRank(a.roleCode);
        const rb = targetOrderRank(b.roleCode);
        if (ra !== rb) return ra - rb;
        return (a.roleCode ?? "").localeCompare(b.roleCode ?? "");
      });

    /** 활성 옵션 + 비회원 sentinel — 콘텐츠 게시대상 (비회원 공개 콘텐츠 지원) 용 */
    const allOptions: TargetRoleOption[] = [
      ...memberOptions,
      { roleCode: null, label: NON_MEMBER_LABEL, isActive: true, isSystem: true },
    ];

    /** 콘텐츠 게시대상 전용 — 사내회원(SUPER_ADMIN / ADMIN) 제외 옵션. */
    const contentTargetOptions: TargetRoleOption[] = allOptions.filter(
      (o) => o.roleCode === null || !ROLE_CODES_HIDDEN_FROM_CONTENT_TARGET.has(o.roleCode),
    );

    /** ContentTarget 행 표시 순서 정렬 — 6 기본 우선, 비회원 마지막 */
    const sortByOrder = <T extends { roleCode: string | null }>(
      targets: readonly T[],
    ): T[] =>
      [...targets].sort((a, b) => {
        const ra = targetOrderRank(a.roleCode);
        const rb = targetOrderRank(b.roleCode);
        if (ra !== rb) return ra - rb;
        return (a.roleCode ?? "").localeCompare(b.roleCode ?? "");
      });

    return {
      resolveLabel,
      isAvailable,
      allOptions,
      memberOptions,
      contentTargetOptions,
      sortByOrder,
      isLoading,
    };
  }, [data, isLoading]);
}
