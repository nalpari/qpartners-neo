// Design Ref: §2 — API Response 타입 + §5 자동채번 로직 + §6 에러 매핑

import { isAxiosError } from "axios";

/** API GET /api/categories 응답의 각 노드 */
export interface CategoryNode {
  id: number;
  parentId: number | null;
  categoryCode: string;
  name: string;
  isInternalOnly: boolean;
  sortOrder: number;
  isActive: boolean;
  children: CategoryNode[];
}

/** POST 요청 body */
export interface CreateCategoryPayload {
  parentId: number | null;
  categoryCode: string;
  name: string;
  isInternalOnly: boolean;
  sortOrder: number;
  isActive: boolean;
}

/** PUT 요청 body (모든 필드 optional) */
export interface UpdateCategoryPayload {
  name?: string;
  isInternalOnly?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

/** CategoriesDetail 폼 상태 */
export interface CategoryFormState {
  isInternalOnly: boolean;
  parentId: number | null;
  categoryCode: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

/**
 * 2Depth 카테고리 코드 자동 생성
 * 규칙: {parentCode}{3자리 순번}
 * 예: 부모 "CTE" → 자식 "CTE001", "CTE002", ...
 */
export function generateChildCode(parentCode: string, siblings: CategoryNode[]): string {
  const nums = siblings
    .map((c) => {
      const suffix = c.categoryCode.slice(parentCode.length);
      return Number(suffix);
    })
    .filter((n) => !isNaN(n) && n > 0);

  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${parentCode}${String(next).padStart(3, "0")}`;
}

// ─── API 에러 → 일본어 UI 메시지 매핑 (Design Ref: §6) ───

const GENERIC_ERROR = "サーバーエラーが発生しました。しばらくしてからお試しください。";

/** HTTP status 기반 에러 메시지 매핑 */
const STATUS_ERROR_MAP: Record<number, string> = {
  409: "入力されたカテゴリコードは既に使用中のカテゴリコードです。",
  404: "対象が見つかりません。",
};

/** 400 에러의 서버 에러 키워드 → UI 메시지 매핑 (향후 errorCode 도입 시 키를 코드로 교체) */
const BAD_REQUEST_PATTERNS: { keyword: string; message: string }[] = [
  { keyword: "하위 카테고리", message: "下位カテゴリが存在するため削除できません。" },
  { keyword: "콘텐츠", message: "コンテンツが紐づいているため削除できません。" },
  { keyword: "2Depth", message: "カテゴリはDepth-2までのみ登録できます。" },
];

/** 에러 응답에서 error 필드 안전 추출 */
function extractErrorMessage(data: unknown): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const err = (data as Record<string, unknown>).error;
    if (typeof err === "string") return err;
  }
  return "";
}

/** API 에러를 일본어 UI 메시지로 변환 */
export function resolveApiErrorMessage(err: unknown): string {
  if (!isAxiosError(err) || !err.response) return GENERIC_ERROR;

  const { status, data } = err.response;

  // status 기반 매핑 우선
  if (status in STATUS_ERROR_MAP) return STATUS_ERROR_MAP[status];

  // 400 에러: 서버 메시지 키워드 매칭
  if (status === 400) {
    const msg = extractErrorMessage(data);
    const matched = BAD_REQUEST_PATTERNS.find((p) => msg.includes(p.keyword));
    if (matched) return matched.message;
  }

  return GENERIC_ERROR;
}

/** 트리에서 ID로 카테고리 검색 (1Depth + 2Depth) */
export function findCategoryById(tree: CategoryNode[], id: number): CategoryNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = node.children.find((c) => c.id === id);
    if (found) return found;
  }
  return null;
}

/** 노드의 모든 자손 카테고리 개수를 재귀로 카운트 (노드 자신은 제외).
 *  API 응답에서 leaf 노드는 children 필드가 누락(undefined)될 수 있어 방어 처리. */
export function countDescendants(node: CategoryNode): number {
  const children = node.children ?? [];
  if (children.length === 0) return 0;
  return children.reduce(
    (sum, child) => sum + 1 + countDescendants(child),
    0,
  );
}
