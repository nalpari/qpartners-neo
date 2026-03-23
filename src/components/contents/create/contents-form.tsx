"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/common";
import { ContentsFormManagement } from "./contents-form-management";
import {
  ContentsFormPostTarget,
  getInitialPostTargets,
} from "./contents-form-post-target";
import type { PostTargetState } from "./contents-form-post-target";
import { ContentsFormCategory } from "./contents-form-category";
import { ContentsFormEditor } from "./contents-form-editor";
import {
  ContentsFormAttachment,
} from "./contents-form-attachment";
import type { AttachmentFile } from "./contents-form-attachment";

interface ContentsFormProps {
  mode: "create" | "edit";
  contentId?: string;
}

export function ContentsForm({ mode }: ContentsFormProps) {
  const router = useRouter();

  // 관리정보 (더미 데이터)
  const distributor = "金志映";
  const publishDate = "2026.03.09";
  const updater = mode === "edit" ? "金志映" : "";
  const updateDate = mode === "edit" ? "2026.03.23" : "";
  const department = "IT管理";
  const [approver, setApprover] = useState("");

  // 게시대상
  const [postTargets, setPostTargets] = useState<PostTargetState>(
    getInitialPostTargets()
  );

  // 카테고리
  const [categories, setCategories] = useState<Record<string, string[]>>({});

  // 자료유형
  const [resourceType, setResourceType] = useState("contents");

  // 제목/내용
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // 파일첨부
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);

  const handleList = () => {
    router.push("/contents", { transitionTypes: ["fade"] });
  };

  const handleSave = () => {
    // 필수항목 검증
    if (!approver) {
      alert("最終確認者は必須入力項目です。");
      return;
    }
    if (!title.trim()) {
      alert("タイトルは必須入力項目です。");
      return;
    }
    if (!content.trim()) {
      alert("内容は必須入力項目です。");
      return;
    }
    if (attachments.length === 0) {
      alert("ファイル添付は必須入力項目です。");
      return;
    }

    alert("保存されました。");
    // TODO: 상세화면으로 전환 (API 연동 시)
    router.push("/contents", { transitionTypes: ["fade"] });
  };

  return (
    <main className="flex flex-col items-center gap-[18px] w-full pb-[120px]">
      <ContentsFormManagement
        distributor={distributor}
        publishDate={publishDate}
        updater={updater}
        updateDate={updateDate}
        department={department}
        approver={approver}
        onApproverChange={setApprover}
      />

      <ContentsFormPostTarget
        postTargets={postTargets}
        onPostTargetsChange={setPostTargets}
      />

      <ContentsFormCategory
        categories={categories}
        onCategoriesChange={setCategories}
      />

      <ContentsFormEditor
        resourceType={resourceType}
        onResourceTypeChange={setResourceType}
        title={title}
        onTitleChange={setTitle}
        content={content}
        onContentChange={setContent}
      />

      <ContentsFormAttachment
        attachments={attachments}
        onAttachmentsChange={setAttachments}
      />

      {/* 하단 버튼 */}
      <div className="flex items-center justify-end gap-[6px] w-[1440px]">
        <Button variant="secondary" onClick={handleList}>
          リスト
        </Button>
        <Button variant="primary" onClick={handleSave}>
          保存
        </Button>
      </div>
    </main>
  );
}
