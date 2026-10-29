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
  /** 콘텐츠 목록 ag-grid 의 카테고리 컬럼 노출 여부 (관리자가 토글). false 면 컬럼 자체가 미노출. */
  isVisible: boolean;
  /**
   * 제품일람(製品一覧) 노출 대상 — REQ-008.
   * 켜면 검색화면 제품일람 탭의 `型番` 축과 형번관리의 카테고리 선택지에 나타난다.
   * 형번은 2Depth 에만 붙으므로 **1Depth 의 값은 기능에 쓰이지 않는다** —
   * 1Depth 는 하위 전체 토글 용도이며 표시값도 자식에서 파생한다
   * (`resolveProductListValue`).
   */
  isProductList: boolean;
  children: CategoryNode[];
}

/** POST 요청 body — isVisible 은 1Depth 전용이라 자식 등록 시 생략 가능 (서버 default true 적용). */
export interface CreateCategoryPayload {
  parentId: number | null;
  categoryCode: string;
  name: string;
  isInternalOnly: boolean;
  sortOrder: number;
  isActive: boolean;
  isVisible?: boolean;
  isProductList: boolean;
}

/** PUT 요청 body (모든 필드 optional) */
export interface UpdateCategoryPayload {
  name?: string;
  /** 1Depth 에 전송하면 서버가 하위 2Depth 전체에 같은 값을 전파한다 (양방향) */
  isInternalOnly?: boolean;
  sortOrder?: number;
  isActive?: boolean;
  isVisible?: boolean;
  /** 1Depth 에 전송하면 서버가 하위 2Depth 전체에 같은 값을 전파한다 (양방향) */
  isProductList?: boolean;
}

/** CategoriesDetail 폼 상태 */
export interface CategoryFormState {
  isInternalOnly: boolean;
  parentId: number | null;
  categoryCode: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  isVisible: boolean;
  isProductList: boolean;
}

/**
 * 카테고리의 `製品一覧表示` 표시값.
 *
 * - **2Depth**: 자기 값 그대로
 * - **1Depth**: 자식이 있으면 **자식 전원 Y 일 때만 Y** (목업 04 안내 문구
 *   「下位項目に N がある場合、上位項目も N と表示」). 1Depth 체크박스는 하위 전체
 *   토글이므로, 개별 2Depth 를 끈 뒤에도 부모가 Y 로 보이면 조작 결과와 어긋난다.
 * - 자식이 없는 1Depth 는 파생할 근거가 없어 자기 값을 쓴다.
 */
export function resolveProductListValue(node: CategoryNode): boolean {
  if (node.parentId !== null) return node.isProductList;
  if (node.children.length === 0) return node.isProductList;
  return node.children.every((c) => c.isProductList);
}

/**
 * 카테고리의 `社内会員専用` 표시값.
 *
 * 규칙은 `製品一覧表示`(`resolveProductListValue`)와 **같다** — 2026-10-23 사용자 지시로
 * 두 플래그의 동작을 통일했다. 종전에는 사내전용만 Y→N 전파를 하지 않아, 1Depth 를 N 으로
 * 되돌려도 자식이 Y 로 남고 좌측 필터·목록에 적색 분류가 그대로 보였다.
 *
 * - **2Depth**: 자기 값 그대로
 * - **1Depth**: 자식이 있으면 **자식 전원 Y 일 때만 Y**. 1Depth 입력이 하위 전체 토글이므로,
 *   개별 2Depth 를 끈 뒤에도 부모가 Y 로 보이면 조작 결과와 어긋난다.
 * - 자식이 없는 1Depth 는 파생할 근거가 없어 자기 값을 쓴다.
 */
export function resolveInternalOnlyValue(node: CategoryNode): boolean {
  if (node.parentId !== null) return node.isInternalOnly;
  if (node.children.length === 0) return node.isInternalOnly;
  return node.children.every((c) => c.isInternalOnly);
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
  // DELETE/cascade-preview 가 자손 카테고리 상한(CATEGORY_MAX_DESCENDANTS) 초과 시 422 반환.
  // preview 단계 메시지(categories-contents.tsx)와 동일 문구로 통일.
  422: "下位カテゴリー数が多すぎます。先に下位を整理してから削除してください。",
};

/** 400 에러의 서버 에러 키워드 → UI 메시지 매핑 (향후 errorCode 도입 시 키를 코드로 교체) */
// NOTE: "하위 카테고리" 패턴은 cascade 정책 전환(2026-04-27)으로 도달 불가 — 제거.
//   현 DELETE 핸들러는 자손 존재 시 cascade 처리, 상한 초과만 422로 분기.
const BAD_REQUEST_PATTERNS: { keyword: string; message: string }[] = [
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

/** GET /api/categories/:id/cascade-preview 응답.
 *  삭제 확인 다이얼로그에서 운영자에게 영향 범위(자손 카테고리 수 + 콘텐츠 링크 수)를 표시.
 *  previewedAt 은 preview/DELETE 사이 TOCTOU 갭 가시화용 메타(ISO 8601). */
export interface CascadePreview {
  id: number;
  descendantCount: number;
  contentLinkCount: number;
  previewedAt: string;
}
