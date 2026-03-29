"use client";

interface InfoFieldProps {
  label: string;
  value: string;
}

function InfoField({ label, value }: InfoFieldProps) {
  return (
    <div className="flex flex-col gap-4 flex-1 min-w-[300px]">
      <h3 className="font-['Noto_Sans_JP'] font-medium text-[15px] leading-normal text-[#101010]">
        {label}
      </h3>
      <div className="flex items-center h-[42px] px-4 bg-[#F5F5F5] border border-[#E0E0E0] rounded-[4px]">
        <span className="font-['Noto_Sans_JP'] font-normal text-[14px] leading-[1.5] text-[#999] overflow-hidden text-ellipsis whitespace-nowrap">
          {value || "—"}
        </span>
      </div>
    </div>
  );
}

interface BulkMailFormInfoProps {
  senderName: string;
  authorName: string;
  authorId: string;
  sentAt: string;
}

export function BulkMailFormInfo({
  senderName,
  authorName,
  authorId,
  sentAt,
}: BulkMailFormInfoProps) {
  return (
    <div className="flex flex-wrap gap-[18px]">
      <InfoField label="差出人表示名" value={senderName} />
      <InfoField label="登録者 名前(ID)" value={`${authorName}(${authorId})`} />
      <InfoField label="配信日" value={sentAt} />
    </div>
  );
}
