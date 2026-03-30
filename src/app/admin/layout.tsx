import { AdminTab } from "@/components/layout/admin-tab";

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex flex-col items-center w-full">
      {/* 탭 네비게이션 */}
      <div className="flex flex-col items-center w-full bg-[#F7F9FB]">
        <AdminTab />
      </div>

      {/* 콘텐츠 영역 */}
      {children}
    </div>
  );
}
