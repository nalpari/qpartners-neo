"use client";

interface RadioProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  readOnly?: boolean;
  name?: string;
  value?: string;
  className?: string;
}

export function Radio({
  checked = false,
  onChange,
  label,
  disabled = false,
  readOnly = false,
  name,
  value,
  className = "",
}: RadioProps) {
  const inactive = disabled || readOnly;

  return (
    <label
      className={`inline-flex items-center gap-2 select-none ${
        inactive ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      } ${className}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => !inactive && onChange?.(!checked)}
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
          <circle
            cx="10"
            cy="10"
            r="9.5"
            stroke={checked ? "#1060B4" : "#E1E3E6"}
            fill={checked ? "transparent" : "white"}
            className="transition-colors duration-200"
          />
          <circle
            cx="10"
            cy="10"
            r={checked ? 4 : 0}
            fill="#1060B4"
            className="transition-all duration-200"
          />
        </svg>
      </span>
      {label && (
        <span
          className={`font-['Noto_Sans_JP'] text-[14px] leading-[1.5] overflow-hidden text-ellipsis whitespace-nowrap ${
            checked ? "text-[#1060b4]" : "text-[#767676]"
          }`}
        >
          {label}
        </span>
      )}
    </label>
  );
}
