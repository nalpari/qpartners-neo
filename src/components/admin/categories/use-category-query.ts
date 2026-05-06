import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import type { CategoryNode } from "./categories-types";

/**
 * 관리자 카테고리 트리 — activeOnly=false (비활성 포함 전체).
 *
 * queryKey 를 ["categories", "all"] 로 분리하는 이유:
 * - contents/* 페이지 들은 ["categories"] + activeOnly=true 로 활성만 fetch
 * - 관리자 페이지는 activeOnly=false 로 비활성 포함 fetch
 * - 같은 키를 쓰면 contents 페이지 진입 후 admin 진입 시 활성만 캐시가 재사용되어
 *   비활성 카테고리가 표시되지 않는 결함 (등록/수정 invalidate 후에야 다시 보임)
 *
 * mutation 의 invalidateQueries(["categories"]) 는 prefix 매칭이라 admin/contents
 * 양쪽 캐시를 모두 무효화 — 일관성 유지에 영향 없음.
 */
export function useCategoryQuery() {
  return useQuery<CategoryNode[]>({
    queryKey: ["categories", "all"],
    queryFn: async () => {
      const res = await api.get<{ data: CategoryNode[] }>("/categories", {
        params: { activeOnly: "false" },
      });
      return res.data.data;
    },
    staleTime: Infinity, // mutation invalidateQueries 시에만 refetch
  });
}
