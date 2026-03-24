import { Suspense } from "react";
import { MypageContents } from "@/components/mypage/mypage-contents";

export default function MypagePage() {
  return (
    <Suspense>
      <MypageContents />
    </Suspense>
  );
}
