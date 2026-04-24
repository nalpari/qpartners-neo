import { InquiryForm } from "@/components/inquiry/inquiry-form";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

export default async function InquiryPage() {
  // INQUIRY.canRead 매트릭스 가드 — `/api/inquiry` 는 PUBLIC 이므로 페이지도 대칭적으로
  // 비회원 접근을 허용한다. 로그인 사용자만 매트릭스 canRead 재검증.
  await requirePageMenuPermission("INQUIRY", "read", { allowAnonymous: true });
  return <InquiryForm />;
}
