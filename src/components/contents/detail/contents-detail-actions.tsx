"use client";

import { Button } from "@/components/common";

interface ContentsDetailActionsProps {
  /** 작성자 가드 (SUPER/ADMIN/본인 등) — 서버 canModifyResource 를 UI 에 반영 */
  canModify: boolean;
  /** CONTENT.canUpdate 매트릭스 — false 면 수정 버튼 숨김 (SUPER_ADMIN 도 매트릭스 따름) */
  canUpdate: boolean;
  /** CONTENT.canDelete 매트릭스 — false 면 삭제 버튼 숨김 */
  canDelete: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onList: () => void;
  className?: string;
}

export function ContentsDetailActions({
  canModify,
  canUpdate,
  canDelete,
  onDelete,
  onEdit,
  onList,
  className = "",
}: ContentsDetailActionsProps) {
  const showDelete = canModify && canDelete;
  const showEdit = canModify && canUpdate;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showDelete && (
        <Button
          variant="secondary"
          onClick={onDelete}
          className="flex-1 lg:flex-none lg:w-[68px]"
        >
          削除
        </Button>
      )}
      {showEdit && (
        <Button
          variant="secondary"
          onClick={onEdit}
          className="!hidden lg:!inline-flex lg:w-[68px]"
        >
          修正
        </Button>
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
