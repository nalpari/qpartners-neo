"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/common";
import { ContentsDetailInfo } from "./contents-detail-info";
import { ContentsDetailTarget } from "./contents-detail-target";
import { ContentsDetailCategory } from "./contents-detail-category";
import { ContentsDetailBody } from "./contents-detail-body";
import { ContentsDetailAttachment } from "./contents-detail-attachment";
import { DUMMY_DETAIL } from "../contents-dummy-data";

interface ContentsDetailProps {
  contentId: string;
}

export function ContentsDetail({ contentId }: ContentsDetailProps) {
  const router = useRouter();
  // TODO: contentId로 실제 데이터 조회 (현재 더미)
  const data = DUMMY_DETAIL;

  const isAdmin = true; // TODO: 실제 권한 체크

  const handleDelete = () => {
    alert("この機能は準備中です。");
  };

  const handleEdit = () => {
    router.push(`/contents/${contentId}/edit`, { transitionTypes: ["fade"] });
  };

  const handleList = () => {
    router.push("/contents", { transitionTypes: ["fade"] });
  };

  return (
    <main className="flex flex-col items-center gap-[10px] lg:gap-[18px] w-full lg:pb-[120px]">
      <ContentsDetailInfo
        viewCount={data.viewCount}
        department={data.department}
        publisher={data.publisher}
        updater={data.updater}
        approver={data.approver}
      />

      <ContentsDetailTarget postTargets={data.postTargets} />

      <ContentsDetailCategory categories={data.categories} />

      <ContentsDetailBody
        title={data.title}
        createdAt={data.createdAt}
        updatedAt={data.updatedAt}
        body={data.body}
      />

      <ContentsDetailAttachment attachments={data.attachments} />

      {/* 하단 버튼 */}
      <div className="flex items-center gap-2 w-full lg:w-[1440px] px-6 lg:px-0 pt-[14px] lg:pt-1 pb-7 lg:pb-1 justify-end">
        {isAdmin && (
          <>
            <Button
              variant="secondary"
              onClick={handleDelete}
              className="flex-1 lg:flex-none lg:w-[68px]"
            >
              削除
            </Button>
            <Button
              variant="secondary"
              onClick={handleEdit}
              className="!hidden lg:!inline-flex lg:w-[68px]"
            >
              修正
            </Button>
          </>
        )}
        <Button
          variant="primary"
          onClick={handleList}
          className="flex-1 lg:flex-none lg:w-[71px]"
        >
          リスト
        </Button>
      </div>
    </main>
  );
}
