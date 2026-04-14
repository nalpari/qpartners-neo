import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import type { CategoryNode } from "./categories-types";

export function useCategoryQuery() {
  return useQuery<CategoryNode[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api.get<{ data: CategoryNode[] }>("/categories", {
        params: { activeOnly: "false" },
      });
      return res.data.data;
    },
    staleTime: Infinity, // mutation invalidateQueries 시에만 refetch
  });
}
