export interface BookmarkMetadata {
  timestamp: number;
  totalCount: number;
  clientVersion: string;
  browser: string; // 浏览器名称，如 "Chrome", "Firefox", "Edge"
  browserVersion: string; // 浏览器版本，如 "120.0.0"
  stats?: {
    totalFolders: number;
  };
}

export interface BookmarkNode {
  id: string;
  parentId?: string;
  index?: number;
  url?: string;
  title: string;
  dateAdded?: number;
  dateGroupModified?: number;
  children?: BookmarkNode[];
  // Chrome 134+ 支持：系统文件夹类型
  // "bookmarks-bar" | "other" | "mobile" | "managed"
  folderType?: string;
}

export interface CloudBackup {
  metadata: BookmarkMetadata;
  data: BookmarkNode[];
}

export interface SyncHistoryItem {
  timestamp: number;
  type: "push" | "pull";
  status: "success" | "failed";
  message?: string;
  count?: number;
  browser?: string;
}
