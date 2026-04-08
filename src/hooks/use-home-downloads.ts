import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import type { DownloadLogsData } from "@/components/home/home-types";

export function useHomeDownloads() {
  const { data, isLoading } = useQuery<DownloadLogsData>({
    queryKey: ["home-downloads"],
    queryFn: async () => {
      const res = await api.get<{ data: DownloadLogsData }>("/mypage/download-logs", {
        params: { pageSize: 3 },
      });
      return res.data.data;
    },
    staleTime: 60_000,
  });

  return {
    downloads: data?.list ?? [],
    isLoading,
  };
}
