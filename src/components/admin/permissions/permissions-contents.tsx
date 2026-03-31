"use client";

import { PermissionsTable } from "./permissions-table";

export function PermissionsContents() {
  return (
    <main className="flex flex-col items-center gap-[18px] w-full pb-[48px]">
      <PermissionsTable />
    </main>
  );
}
