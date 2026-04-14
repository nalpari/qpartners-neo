import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { useAlertStore } from "@/lib/store";
import type {
  CategoryNode,
  CreateCategoryPayload,
  UpdateCategoryPayload,
} from "./categories-types";
import { resolveApiErrorMessage } from "./categories-types";

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
    mutationFn: (id: number) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      onDeleteSuccess();
      openAlert({ type: "alert", message: "削除されました。" });
    },
    onError: handleApiError,
  });

  const isSaving = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return { createMutation, updateMutation, deleteMutation, isSaving };
}
