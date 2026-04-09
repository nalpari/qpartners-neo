export interface DownloadLogItem {
  id: number;
  downloadedAt: string;
  contentTitle: string;
  fileName: string;
  isExpired: boolean;
}

export interface DownloadLogsData {
  totalCount: number;
  list: DownloadLogItem[];
}
