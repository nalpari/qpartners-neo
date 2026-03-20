import { ViewTransition } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ViewTransition>{children}</ViewTransition>;
}
