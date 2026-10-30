import { useMutation, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/axios";
import { useAlertStore } from "@/lib/store";

import {
  resolveApiErrorMessage,
  type CreateProductModelPayload,
  type DeleteProductModelResponse,
  type ProductModelItem,
  type UpdateProductModelPayload,
} from "./product-models-types";

interface UseProductModelMutationsOptions {
  onCreateSuccess: (model: ProductModelItem) => void;
  onUpdateSuccess: () => void;
  onDeleteSuccess: () => void;
}

export function useProductModelMutations({
  onCreateSuccess,
  onUpdateSuccess,
  onDeleteSuccess,
}: UseProductModelMutationsOptions) {
  const { openAlert } = useAlertStore();
  const queryClient = useQueryClient();

  function handleApiError(err: unknown) {
    console.error("[ProductModels] API 에러:", err);
    openAlert({ type: "alert", message: resolveApiErrorMessage(err) });
  }

  /**
   * 형번이 바뀌면 이용자 화면의 제품일람·형번축·자동완성이 모두 달라진다.
   * `products` / `search-suggest` 캐시까지 무효화해 같은 세션에서 바로 반영되게 한다.
   */
  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["product-models"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["search-suggest"] });
  }

  const createMutation = useMutation({
    mutationFn: async (payload: CreateProductModelPayload) => {
      const res = await api.post<{ data: ProductModelItem }>("/product-models", payload);
      return res.data.data;
    },
    onSuccess: (model) => {
      invalidateAll();
      onCreateSuccess(model);
      openAlert({ type: "alert", message: "保存されました。" });
    },
    onError: handleApiError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateProductModelPayload }) =>
      api.put(`/product-models/${id}`, payload),
    onSuccess: () => {
      invalidateAll();
      onUpdateSuccess();
      openAlert({ type: "alert", message: "保存されました。" });
    },
    onError: handleApiError,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete<{ data: DeleteProductModelResponse }>(
        `/product-models/${id}`,
      );
      return res.data.data;
    },
    onSuccess: (result) => {
      invalidateAll();
      onDeleteSuccess();
      // 실제로 해제된 연결 수를 삭제 직후에 알린다 — 사전 미리보기(cascade-preview)와
      // 실제 결과가 어긋날 수 있으므로 확정 수치를 한 번 더 보여준다.
      const message =
        result.linkedContentCount > 0
          ? `削除されました。\n（資料との紐付け${result.linkedContentCount}件も併せて解除されました）`
          : "削除されました。";
      openAlert({ type: "alert", message });
    },
    onError: handleApiError,
  });

  const isSaving =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return { createMutation, updateMutation, deleteMutation, isSaving };
}
