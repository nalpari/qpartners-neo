"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import type { MenuTreeItem, MenuTreeResponse } from "@/components/admin/menus/menus-types";

interface UseMenuTreeOptions {
  /** false 지정 시 비활성 메뉴도 포함해 조회 (관리자 화면 전용) */
  activeOnly?: boolean;
  /** 비로그인 등에서 fetch 자체를 차단하고 싶을 때 false */
  enabled?: boolean;
}

/**
 * 메뉴 트리 공통 조회 훅 — `/api/menus?activeOnly=...` 단일 호출.
 * - 기본값: activeOnly=true, 5분 캐시
 * - queryKey 는 기존 소비처와 동일한 `["menus", activeOnly]` 유지 (캐시 공유)
 * - `/api/menus` 는 middleware 에서 인증 필요 → 비로그인 사용자에게 노출하려면
 *   `enabled: false` + 호출측 fallback 처리 권장
 */
export function useMenuTree(options: UseMenuTreeOptions = {}) {
  const { activeOnly = true, enabled = true } = options;
  return useQuery<MenuTreeItem[]>({
    queryKey: ["menus", activeOnly],
    queryFn: async () => {
      const res = await api.get<MenuTreeResponse>("/menus", {
        params: { activeOnly: String(activeOnly) },
      });
      return res.data.data;
    },
    staleTime: 5 * 60_000,
    enabled,
  });
}
