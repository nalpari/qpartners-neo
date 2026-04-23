import { InquiryForm } from "@/components/inquiry/inquiry-form";
import { requirePageMenuPermission } from "@/lib/rbac-guard";

export default async function InquiryPage() {
  // INQUIRY.canRead 매트릭스 가드
  await requirePageMenuPermission("INQUIRY", "read");
  return <InquiryForm />;
}
