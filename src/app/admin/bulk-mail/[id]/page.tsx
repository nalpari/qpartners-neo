import { BulkMailForm } from "@/components/admin/bulk-mail/form/bulk-mail-form";
import { DUMMY_DETAIL_DATA } from "@/components/admin/bulk-mail/form/bulk-mail-form-dummy-data";

export default function AdminBulkMailDetailPage() {
  return <BulkMailForm mode="detail" initialData={DUMMY_DETAIL_DATA} />;
}
