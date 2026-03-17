"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "outline";
type ButtonSize = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-[#E97923] text-white hover:bg-[#B05713]",
  secondary: "bg-[#767676] text-white hover:bg-[#434141]",
  outline:
    "bg-white border border-[#C2CDDB] text-[#2E5884] hover:bg-[#E9EDF2]",
};

const mdBorderStyles: Record<ButtonVariant, string> = {
  primary:
    "border border-[#CB6212] shadow-[0.5px_1.5px_1px_0px_rgba(0,0,0,0.15)] hover:border-[#8A4007] hover:shadow-none",
  secondary:
    "border border-[#626262] shadow-[0.5px_1.5px_1px_0px_rgba(0,0,0,0.15)] hover:border-[#232323] hover:shadow-none",
  outline: "",
};

const sizeStyles: Record<ButtonSize, string> = {
  md: "h-[42px] min-w-[68px] px-4 text-[13px]",
  lg: "h-[56px] px-4 text-[15px]",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  children,
  disabled = false,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-[4px] font-['Noto_Sans_JP'] font-medium leading-[1.5] text-center whitespace-nowrap transition-colors duration-150 ${
        sizeStyles[size]
      } ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : `${variantStyles[variant]} ${size === "md" ? mdBorderStyles[variant] : ""}`
      } ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
