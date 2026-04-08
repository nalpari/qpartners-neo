import { Suspense } from "react";
import { ContentsContents } from "@/components/contents/list/contents-contents";
import { Spinner } from "@/components/common";

export default function ContentsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center w-full py-20"><Spinner size={48} /></div>}>
      <ContentsContents />
    </Suspense>
  );
}
