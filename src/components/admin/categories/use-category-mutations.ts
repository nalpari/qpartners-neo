import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { useAlertStore } from "@/lib/store";
import type {
  CategoryNode,
  CreateCategoryPayload,
  UpdateCategoryPayload,
} from "./categories-types";
import { resolveApiErrorMessage } from "./categories-types";

interface DeleteCategoryResponse {
  id: number;
  cascadedCategoryCount: number;
  cascadedContentCount: number;
}

interface UseCategoryMutationsOptions {
  onCreateSuccess: (node: CategoryNode) => void;
  onDeleteSuccess: () => void;
}

export function useCategoryMutations({
  onCreateSuccess,
  onDeleteSuccess,
}: UseCategoryMutationsOptions) {
  const { openAlert } = useAlertStore();
  const queryClient = useQueryClient();

  function handleApiError(err: unknown) {
    console.error("[Categories] API 에러:", err);
    openAlert({ type: "alert", message: resolveApiErrorMessage(err) });
  }

  const createMutation = useMutation({
    mutationFn: (payload: CreateCategoryPayload) =>
      api.post<{ data: CategoryNode }>("/categories", payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      onCreateSuccess(res.data.data);
      openAlert({ type: "alert", message: "保存されました。" });
    },
    onError: handleApiError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateCategoryPayload }) =>
      api.put(`/categories/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      openAlert({ type: "alert", message: "保存されました。" });
    },
    onError: handleApiError,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete<{ data: DeleteCategoryResponse }>(`/categories/${id}`);
      return res.data.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      onDeleteSuccess();
      // cascade 결과를 운영자에게 명시 — 미리보기와 실제 결과가 일치하지 않을 수 있으므로
      // 삭제 직후 실제 정리된 수를 보여주어 추적성 확보.
      const summaryParts: string[] = [];
      if (result.cascadedCategoryCount > 0) {
        summaryParts.push(`下位カテゴリー${result.cascadedCategoryCount}件`);
      }
      if (result.cascadedContentCount > 0) {
        summaryParts.push(`コンテンツの紐付け${result.cascadedContentCount}件`);
      }
      const message = summaryParts.length > 0
        ? `削除されました。\n（${summaryParts.join("・")}も併せて整理されました）`
        : "削除されました。";
      openAlert({ type: "alert", message });
    },
    onError: handleApiError,
  });

  const isSaving = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return { createMutation, updateMutation, deleteMutation, isSaving };
}
