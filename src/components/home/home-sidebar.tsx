// Design Ref: §6 — PC 사이드바 래퍼 (최근 다운로드만)

import { HomeDownloadsPc } from "./home-downloads-pc";

export function HomeSidebar() {
  return (
    <aside className="hidden lg:flex flex-col gap-[18px] w-[316px] shrink-0">
      <HomeDownloadsPc />
    </aside>
  );
}
