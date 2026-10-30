import { ProductDetail } from "@/components/products/product-detail";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

/**
 * 제품상세 (製品一覧 詳細) — 검색기능 고도화 REQ-010.
 *
 * RBAC 는 `/contents` · `/contents/[id]` 와 동일 정책이다: `CONTENT.read` 매트릭스 +
 * 비회원 허용. `/api/products/[id]` GET 이 middleware PUBLIC_GET_PATTERNS 로 열려 있어
 * 페이지도 대칭을 맞춘다. 노출 불가 형번(비표시 / 제품일람 OFF / 사용중지·사내전용 카테고리)은
 * API 가 404 로 답하고, 화면은 「製品が見つかりません。」 으로 수렴한다.
 *
 * 페이지 번호를 URL(`?page=`)에 두는 이유: 자료 목록이 길어 페이지를 넘긴 뒤 자료상세로
 * 들어갔다 돌아오는 흐름이 있다. 콘텐츠 목록은 sessionStorage 복원 규약을 쓰지만, 이 화면은
 * 상태가 페이지 하나뿐이라 URL 이 더 단순하고 공유도 된다.
 */
export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  await requirePageMenuPermission("CONTENT", "read", { allowAnonymous: true });

  const { id } = await params;
  const { page } = await searchParams;
  const parsedPage = typeof page === "string" ? Number(page) : NaN;
  const initialPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  return <ProductDetail productId={id} page={initialPage} />;
}
