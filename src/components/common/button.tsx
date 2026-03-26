"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "point" | "outline";
type ButtonSize = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: {
    md: "bg-[#E97923] border border-[#CB6212] text-white shadow-[0.5px_1.5px_1px_0px_rgba(0,0,0,0.15)] hover:bg-[#B05713] hover:border-[#8A4007] hover:shadow-none",
    lg: "bg-[#E97923] text-white hover:bg-[#B05713]",
  },
  secondary: {
    md: "bg-[#767676] border border-[#626262] text-white shadow-[0.5px_1.5px_1px_0px_rgba(0,0,0,0.15)] hover:bg-[#434141] hover:border-[#232323] hover:shadow-none",
    lg: "bg-[#767676] text-white hover:bg-[#434141]",
  },
  point: {
    md: "bg-[#506273] border border-[#405161] text-white shadow-[0.5px_1.5px_1px_0px_rgba(0,0,0,0.15)] hover:bg-[#3e5061] hover:border-[#2e3f4f] hover:shadow-none",
    lg: "bg-[#506273] text-white hover:bg-[#3e5061]",
  },
  outline: {
    md: "bg-white border border-[#C2CDDB] text-[#2E5884] hover:bg-[#E9EDF2]",
    lg: "bg-white border border-[#C2CDDB] text-[#2E5884] hover:bg-[#E9EDF2]",
  },
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
      } ${variantStyles[variant][size]} ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      } ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
