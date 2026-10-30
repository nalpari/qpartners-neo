// 형번관리 (型番管理) — 검색기능 고도화 REQ-007. 목업 03-admin-models.html 기준.

import { isAxiosError } from "axios";

import type { ProductModelStatus } from "@/lib/schemas/product-model";

/** 형번이 속한 2Depth 카테고리 (+ 1Depth 부모) — `/api/product-models` 응답 */
export interface ProductModelCategory {
  id: number;
  categoryCode: string;
  name: string;
  isActive: boolean;
  isProductList: boolean;
  /**
   * 카테고리 표시순서 — REQ-007 「제품 카테고리 순서 : 카테고리 관리에서 설정한 순서를
   * **조회용** 제공」. 형번관리에서는 읽기 전용이며, 값의 정본은 카테고리 관리 화면이다.
   */
  sortOrder: number;
  /** 사내전용 카테고리 — 목록에서 적색으로 표기한다 */
  isInternalOnly: boolean;
  parent: {
    id: number;
    categoryCode: string;
    name: string;
    isActive: boolean;
    isInternalOnly: boolean;
    sortOrder: number;
  } | null;
}

/** 목록 아이템 */
export interface ProductModelItem {
  id: number;
  categoryId: number;
  modelCode: string;
  /** 제품상태 — REQ-007 관리 항목. 자료일람 표시는 이 값에서 파생한다(REQ-005) */
  status: ProductModelStatus;
  sortOrder: number;
  isVisible: boolean;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  category: ProductModelCategory;
}

export interface ProductModelListResponse {
  data: ProductModelItem[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/** 검색 필터 — 목업 03 검색조건 3개 (型番 / カテゴリ / 表示／非表示) */
export interface ProductModelSearchFilters {
  /** 형번명 부분일치. 3자 미만은 서버가 조건에서 제외한다 */
  modelCode: string;
  /** 카테고리 id 문자열. `""` = すべて */
  categoryId: string;
  /** `""` = すべて / `"1"` = 表示 / `"0"` = 非表示 */
  visibility: string;
}

export const INITIAL_FILTERS: ProductModelSearchFilters = {
  modelCode: "",
  categoryId: "",
  visibility: "",
};

export const VISIBILITY_OPTIONS = [
  { value: "", label: "すべて" },
  { value: "1", label: "表示" },
  { value: "0", label: "非表示" },
];

/**
 * 폼 상태.
 *
 * `isVisible` 이 `boolean | null` 인 이유: 목업 폼은 라디오를 **미선택으로 시작**하고
 * 저장 시 「表示／非表示を選択してください。」 로 선택을 강제한다
 * (`03-admin-models.html:313` `required` / `:419` 검증). 기본값을 Y 로 깔면
 * 운영자가 의식하지 않은 채 표시 상태로 저장되므로 미선택 상태를 그대로 표현한다.
 */
export interface ProductModelFormState {
  categoryId: number | null;
  modelCode: string;
  /**
   * 제품상태. `null` = 미선택 — `isVisible` 과 같은 이유다. 목업
   * `03-admin-models.html:318` 의 `modelStatus` 라디오도 `required` 로 두고
   * `:443` 에서 「製品ステータスを選択してください。」 로 선택을 강제한다.
   */
  status: ProductModelStatus | null;
  sortOrder: number;
  isVisible: boolean | null;
}

export const INITIAL_FORM: ProductModelFormState = {
  categoryId: null,
  modelCode: "",
  status: null,
  sortOrder: 1,
  isVisible: null,
};

export function getInitialForm(
  model: ProductModelItem | null,
): ProductModelFormState {
  if (!model) return INITIAL_FORM;
  return {
    categoryId: model.categoryId,
    modelCode: model.modelCode,
    status: model.status,
    sortOrder: model.sortOrder,
    isVisible: model.isVisible,
  };
}

/** POST body */
export interface CreateProductModelPayload {
  categoryId: number;
  modelCode: string;
  status: ProductModelStatus;
  sortOrder: number;
  isVisible: boolean;
}

/** PUT body — 전 필드 optional 이지만 화면은 항상 전량 전송한다 */
export interface UpdateProductModelPayload {
  categoryId: number;
  modelCode: string;
  status: ProductModelStatus;
  sortOrder: number;
  isVisible: boolean;
}

/** DELETE 응답 */
export interface DeleteProductModelResponse {
  id: number;
  linkedContentCount: number;
}

/** GET /api/product-models/:id/cascade-preview 응답 */
export interface ProductModelCascadePreview {
  id: number;
  contentLinkCount: number;
  previewedAt: string;
}

/** 카테고리 선택지 — `/api/categories` 트리에서 제품일람 대상 2Depth 만 추린 결과 */
export interface ProductCategoryOption {
  value: string;
  label: string;
}

/** ISO 8601 → `YYYY.MM.DD` (목업 `登録日` 표기) */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

/**
 * 카테고리 표시명 — 1Depth 부모가 있으면 `부모 > 자식`.
 *
 * 제품일람 대상은 제품 카테고리 한정이 아니라 **전 카테고리**로 확장됐다(고객 확장성 요구).
 * 서로 다른 축에 같은 이름의 2Depth 가 생길 수 있어 부모를 함께 보여준다.
 */
export function formatCategoryLabel(category: {
  name: string;
  parent: { name: string } | null;
}): string {
  return category.parent ? `${category.parent.name} > ${category.name}` : category.name;
}

// ─── API 에러 → 일본어 UI 메시지 ───

const GENERIC_ERROR = "サーバーエラーが発生しました。しばらくしてからお試しください。";

const STATUS_ERROR_MAP: Record<number, string> = {
  // (category_id, model_code) UNIQUE 위반 — 서버 메시지와 동일 문구 유지
  409: "同じカテゴリ内に同じ型番が登録されています。",
  404: "対象が見つかりません。ページを更新してください。",
};

/**
 * 400 은 서버가 사유별로 다른 일본어 문구를 돌려준다
 * (`カテゴリが存在しません` / `型番は 2Depth カテゴリにのみ登録できます` /
 *  `製品一覧表示が ON のカテゴリのみ選択できます`). 이미 유저 대면 문구이므로
 * 키워드 매핑으로 치환하지 않고 그대로 노출한다 — 어떤 제약을 어겼는지가 사라지면
 * 운영자가 카테고리 설정을 고칠 단서를 잃는다.
 */
export function resolveApiErrorMessage(err: unknown): string {
  if (!isAxiosError(err) || !err.response) return GENERIC_ERROR;

  const { status, data } = err.response;
  if (status in STATUS_ERROR_MAP) return STATUS_ERROR_MAP[status];

  if (status === 400 && typeof data === "object" && data !== null && "error" in data) {
    const message = (data as Record<string, unknown>).error;
    // Zod 검증 실패는 `Validation failed` + issues 라 그대로 노출할 수 없다.
    if (typeof message === "string" && message !== "Validation failed") return message;
  }

  return GENERIC_ERROR;
}
