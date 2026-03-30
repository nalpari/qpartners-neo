"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button, Checkbox } from "@/components/common";
import type { RecipientItem, RecipientOption } from "./bulk-mail-form-dummy-data";
import { RECIPIENT_OPTIONS } from "./bulk-mail-form-dummy-data";

/** 검색 가능 Select (퍼블리싱용) */
function RecipientSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (opt: RecipientOption) => void;
  disabled: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const filtered = RECIPIENT_OPTIONS.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next && btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      }
      return next;
    });
  };

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
      setSearch("");
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  if (disabled) {
    return (
      <div className="flex items-center w-full h-[36px] px-3 bg-[#F5F5F5] border border-[#E0E0E0] rounded-[4px] cursor-not-allowed">
        <span className="flex-1 font-['Noto_Sans_JP'] text-[13px] text-[#999] truncate">{value || "—"}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="shrink-0 ml-1 opacity-40">
          <path d="M1 1L5 5L9 1" stroke="#767676" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="flex items-center w-full h-[36px] px-3 bg-white border border-[#EBEBEB] rounded-[4px] font-['Noto_Sans_JP'] text-[13px] text-[#101010] text-left"
      >
        <span className="flex-1 truncate">{value || "選択"}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="shrink-0 ml-1">
          <path d="M1 1L5 5L9 1" stroke="#767676" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] bg-white border border-[#EBEBEB] rounded-[6px] shadow-[0_4px_12px_rgba(0,0,0,0.08)] max-h-[200px] overflow-hidden flex flex-col"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="検索..."
            className="w-full px-3 py-2 border-b border-[#EBEBEB] font-['Noto_Sans_JP'] text-[13px] outline-none"
            autoFocus
          />
          <div className="overflow-y-auto max-h-[160px]">
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                  setSearch("");
                }}
                className="flex items-center w-full px-3 h-[36px] font-['Noto_Sans_JP'] text-[13px] text-[#101010] text-left hover:bg-[#F5F5F5]"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* empty — styles inlined below */

interface RecipientTableProps {
  label: string;
  recipients: RecipientItem[];
  onRecipientsChange: (items: RecipientItem[]) => void;
  disabled: boolean;
}

function RecipientTable({
  label,
  recipients,
  onRecipientsChange,
  disabled,
}: RecipientTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allChecked = recipients.length > 0 && selectedIds.size === recipients.length;
  const someChecked = selectedIds.size > 0 && selectedIds.size < recipients.length;

  const toggleAll = useCallback(() => {
    if (allChecked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(recipients.map((r) => r.id)));
    }
  }, [allChecked, recipients]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAdd = () => {
    const newId = `r-${Date.now()}`;
    onRecipientsChange([...recipients, { id: newId, nameOrId: "", email: "" }]);
  };

  const handleDelete = () => {
    onRecipientsChange(recipients.filter((r) => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
  };

  const handleSelectRecipient = (index: number, opt: RecipientOption) => {
    const updated = [...recipients];
    updated[index] = { ...updated[index], nameOrId: opt.label, email: opt.email };
    onRecipientsChange(updated);
  };

  return (
    <div className="flex flex-1 flex-col gap-2 min-w-0">
      {/* 라벨 + 버튼 */}
      <div className="flex items-center justify-between">
        <h3 className="font-['Noto_Sans_JP'] font-semibold text-[14px] text-[#101010]">
          {label}
        </h3>
        {!disabled && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleAdd} className="!h-[30px] !min-w-0 !px-3 !text-[12px]">
              +Add
            </Button>
            <Button
              variant="secondary"
              onClick={handleDelete}
              disabled={selectedIds.size === 0}
              className="!h-[30px] !min-w-0 !px-3 !text-[12px]"
            >
              -Delete
            </Button>
          </div>
        )}
      </div>

      {/* Figma 212-5087 스타일 테이블 */}
      <div className="flex flex-col">
        {/* 헤더 */}
        <div className="flex items-stretch pr-px">
          <div className="flex-none w-[60px] flex items-center justify-center bg-[#506273] py-3 rounded-l-[8px] -mr-px overflow-hidden">
            <Checkbox
              checked={allChecked}
              indeterminate={someChecked}
              onChange={toggleAll}
              disabled={disabled}
            />
          </div>
          <div className="flex-1 flex items-center justify-center bg-[#506273] py-3 px-3 -mr-px overflow-hidden">
            <span className="font-['Noto_Sans_JP'] font-semibold text-[14px] text-[#f5f5f5] whitespace-nowrap">
              Name / ID
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center bg-[#506273] py-3 px-3 rounded-r-[8px] -mr-px overflow-hidden">
            <span className="font-['Noto_Sans_JP'] font-semibold text-[14px] text-[#f5f5f5] whitespace-nowrap">
              Email
            </span>
          </div>
        </div>

        {/* 바디 */}
        <div className="flex flex-col max-h-[110px] overflow-y-auto">
          {recipients.length === 0 ? (
            <div className="flex items-center justify-center h-[57px] border-b border-[#e6eef6] font-['Noto_Sans_JP'] text-[14px] text-[#999]">
              データがありません
            </div>
          ) : (
            recipients.map((r, i) => (
              <div
                key={r.id}
                className={`flex items-stretch ${
                  i % 2 !== 0 ? "bg-[#fcfdff]" : "bg-white"
                }`}
              >
                <div className="flex-none w-[60px] flex items-center justify-center py-2 border-b border-[#e6eef6] overflow-hidden">
                  <Checkbox
                    checked={selectedIds.has(r.id)}
                    onChange={() => toggleOne(r.id)}
                    disabled={disabled}
                  />
                </div>
                <div className="flex-1 flex items-center py-2 px-3 border-b border-[#e6eef6] overflow-visible">
                  <RecipientSelect
                    value={r.nameOrId}
                    onChange={(opt) => handleSelectRecipient(i, opt)}
                    disabled={disabled}
                  />
                </div>
                <div className="flex-1 flex items-center py-2 px-3 border-b border-[#e6eef6] overflow-hidden">
                  <span className="font-['Noto_Sans_JP'] text-[14px] text-[#555] overflow-hidden text-ellipsis whitespace-nowrap">
                    {r.email || "—"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface BulkMailFormRecipientsProps {
  ccRecipients: RecipientItem[];
  bccRecipients: RecipientItem[];
  onCcChange: (items: RecipientItem[]) => void;
  onBccChange: (items: RecipientItem[]) => void;
  disabled: boolean;
}

export function BulkMailFormRecipients({
  ccRecipients,
  bccRecipients,
  onCcChange,
  onBccChange,
  disabled,
}: BulkMailFormRecipientsProps) {
  return (
    <div className="flex flex-wrap gap-[18px]">
      <RecipientTable
        label="CC 受信者"
        recipients={ccRecipients}
        onRecipientsChange={onCcChange}
        disabled={disabled}
      />
      <RecipientTable
        label="BCC 受信者"
        recipients={bccRecipients}
        onRecipientsChange={onBccChange}
        disabled={disabled}
      />
    </div>
  );
}
