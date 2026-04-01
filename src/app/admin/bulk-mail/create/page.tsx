import { BulkMailForm } from "@/components/admin/bulk-mail/form/bulk-mail-form";
import { EMPTY_FORM_DATA } from "@/components/admin/bulk-mail/form/bulk-mail-form-dummy-data";

export default function AdminBulkMailCreatePage() {
  return <BulkMailForm mode="create" initialData={EMPTY_FORM_DATA} />;
}
