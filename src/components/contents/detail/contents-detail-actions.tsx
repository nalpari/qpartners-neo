"use client";

import { Button } from "@/components/common";

interface ContentsDetailActionsProps {
  canModify: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onList: () => void;
  className?: string;
}

export function ContentsDetailActions({
  canModify,
  onDelete,
  onEdit,
  onList,
  className = "",
}: ContentsDetailActionsProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {canModify && (
        <>
          <Button
            variant="secondary"
            onClick={onDelete}
            className="flex-1 lg:flex-none lg:w-[68px]"
          >
            削除
          </Button>
          <Button
            variant="secondary"
            onClick={onEdit}
            className="!hidden lg:!inline-flex lg:w-[68px]"
          >
            修正
          </Button>
        </>
      )}
      <Button
        variant="primary"
        onClick={onList}
        className="flex-1 lg:flex-none lg:w-[71px]"
      >
        リスト
      </Button>
    </div>
  );
}
