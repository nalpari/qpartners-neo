"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";

interface DbHealth {
  ok: boolean;
}

async function fetchDbHealth(): Promise<DbHealth> {
  const { data } = await api.get<DbHealth>("/health/db");
  return data;
}

export function DbStatusIndicator() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["health", "db"],
    queryFn: fetchDbHealth,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });

  const isOk = !isError && data?.ok === true;
  const colorClass = isPending
    ? "bg-gray-300"
    : isOk
      ? "bg-green-500"
      : "bg-red-500";
  const label = isPending
    ? "DB 接続確認中"
    : isOk
      ? "DB 接続正常"
      : "DB 接続エラー";

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colorClass}`}
      role="status"
      aria-label={label}
      title={label}
    />
  );
}
