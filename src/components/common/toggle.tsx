"use client";

interface ToggleProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function Toggle({
  checked = false,
  onChange,
  label,
  disabled = false,
  className = "",
}: ToggleProps) {
  return (
    <label
      className={`inline-flex items-center gap-2 select-none ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      } ${className}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => !disabled && onChange?.(e.target.checked)}
        disabled={disabled}
        className="sr-only peer"
      />
      <span
        className={`relative shrink-0 w-[44px] h-[24px] rounded-full transition-colors duration-200 ${
          checked ? "bg-[#1060B4]" : "bg-[#D1D1D1]"
        } ${!disabled ? "active:scale-95" : ""}`}
      >
        <span
          className={`absolute top-[2px] h-[20px] w-[20px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-[22px]" : "translate-x-[2px]"
          }`}
        />
      </span>
      {label && (
        <span className="font-['Noto_Sans_JP'] text-sm leading-[1.5] text-[#101010] whitespace-nowrap">
          {label}
        </span>
      )}
    </label>
  );
}
