"use client";

interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}

export function Checkbox({
  checked = false,
  onChange,
  label,
  disabled = false,
  readOnly = false,
  className = "",
}: CheckboxProps) {
  const inactive = disabled || readOnly;

  return (
    <label
      className={`inline-flex items-center gap-2 select-none ${
        inactive ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      } ${className}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => !inactive && onChange?.(e.target.checked)}
        disabled={disabled}
        readOnly={readOnly}
        className="sr-only peer"
      />
      <span className={`shrink-0 transition-transform duration-150 ${inactive ? "" : "active:scale-90"}`}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            width="20"
            height="20"
            rx="4"
            fill={checked ? "#E97923" : "#fff"}
            className="transition-colors duration-200"
          />
          {!checked && (
            <rect
              x="0.5"
              y="0.5"
              width="19"
              height="19"
              rx="3.5"
              stroke="#E1E3E6"
              className="transition-opacity duration-200"
            />
          )}
          <path
            d="M5.5 10L8.5 13L14.5 7"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="16"
            strokeDashoffset={checked ? "0" : "16"}
            className="transition-[stroke-dashoffset] duration-200"
          />
        </svg>
      </span>
      {label && (
        <span
          className="font-['Noto_Sans_JP'] text-sm leading-[1.5] text-[#101010] whitespace-nowrap"
        >
          {label}
        </span>
      )}
    </label>
  );
}
