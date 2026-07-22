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
  createdBy: string;
  createdByName: string | null;
  sentAt: string;
  /** 예약(또는 즉시) 발송 예정 일시 (포맷 완료 문자열). 값이 있으면 配信予定日時 필드 노출. */
  scheduledSendAt?: string;
}

/** 등록자 표시: 이름(ID) 형식. 이름 없으면 ID만, 둘 다 없으면 "—" */
function formatRegistrant(createdBy: string, createdByName: string | null): string {
  if (!createdBy) return "—";
  if (createdByName) return `${createdByName}(${createdBy})`;
  return createdBy;
}

export function BulkMailFormInfo({
  senderName,
  createdBy,
  createdByName,
  sentAt,
  scheduledSendAt,
}: BulkMailFormInfoProps) {
  return (
    <div className="flex flex-wrap gap-[18px]">
      <InfoField label="差出人表示名" value={senderName} />
      <InfoField label="登録者" value={formatRegistrant(createdBy, createdByName)} />
      {scheduledSendAt ? <InfoField label="配信予定日時" value={scheduledSendAt} /> : null}
      <InfoField label="配信日" value={sentAt} />
    </div>
  );
}
