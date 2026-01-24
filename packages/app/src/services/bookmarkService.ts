import { CloudBackup, BookmarkMetadata, BookmarkNode } from "../types";
import { getBrowserInfo } from "../lib/browser";
import { BookmarksAPI } from "../lib/bookmarksApi";

// ============================================================================
// 跨浏览器系统文件夹映射
// Chrome/Edge: 使用 folderType 属性 ("bookmarks-bar", "other", "mobile", "managed")
// Firefox: 使用 ID 模式 ("toolbar_____", "unfiled_____", "menu________", "mobile______")
// ============================================================================

/** Chrome/Edge folderType -> Firefox ID */
const FOLDER_TYPE_TO_FIREFOX_ID: Record<string, string> = {
  "bookmarks-bar": "toolbar_____",
  other: "unfiled_____",
  mobile: "mobile______",
};

/** Firefox ID -> Chrome/Edge folderType */
const FIREFOX_ID_TO_FOLDER_TYPE: Record<string, string> = {
  toolbar_____: "bookmarks-bar",
  unfiled_____: "other",
  mobile______: "mobile",
};

/** Firefox 系统文件夹 ID 列表 */
const FIREFOX_SYSTEM_IDS = [
  "toolbar_____",
  "unfiled_____",
  "menu________",
  "mobile______",
];

/**
 * 判断节点是否为系统根文件夹（不应参与内容比对）
 * - Chrome/Edge 根节点 (id="0", 标题为空)
 * - Firefox 根节点 (id="root________")
 * - Chrome/Edge 系统文件夹 (有 folderType 属性)
 * - Firefox 系统文件夹 (特殊 ID)
 */
function isSystemRootFolder(node: BookmarkNode): boolean {
  if (node.url) return false;
  // Chrome/Edge 根节点
  if (node.id === "0" && !node.title) return true;
  // Firefox 根节点
  if (node.id === "root________") return true;
  // Chrome/Edge: 有 folderType 属性
  if (node.folderType) return true;
  // Firefox: 使用特殊 ID
  return FIREFOX_SYSTEM_IDS.includes(node.id);
}

/**
 * 查找本地系统文件夹匹配（跨浏览器）
 */
function findMatchingSystemFolder(
  backupNode: BookmarkNode,
  localFolders: BookmarkNode[],
): BookmarkNode | null {
  // 1. Chrome/Edge 备份 -> 本地匹配
  if (backupNode.folderType) {
    // 优先匹配相同 folderType
    const match = localFolders.find(
      (l) => l.folderType === backupNode.folderType,
    );
    if (match) return match;
    // 跨浏览器: Chrome/Edge -> Firefox
    const firefoxId = FOLDER_TYPE_TO_FIREFOX_ID[backupNode.folderType];
    if (firefoxId) {
      const firefoxMatch = localFolders.find((l) => l.id === firefoxId);
      if (firefoxMatch) return firefoxMatch;
    }
  }

  // 2. Firefox 备份 -> 本地匹配
  const mappedType = FIREFOX_ID_TO_FOLDER_TYPE[backupNode.id];
  if (mappedType) {
    // Firefox -> Chrome/Edge
    const match = localFolders.find((l) => l.folderType === mappedType);
    if (match) return match;
    // Firefox -> Firefox
    const sameIdMatch = localFolders.find((l) => l.id === backupNode.id);
    if (sameIdMatch) return sameIdMatch;
  }

  // 3. 标题匹配（普通文件夹）
  const titleMatch = localFolders.find((l) => l.title === backupNode.title);
  if (titleMatch) return titleMatch;

  return null;
}

export const BookmarkService = {
  /** 获取完整书签树 */
  async getTree(): Promise<BookmarkNode[]> {
    return (await BookmarksAPI.getTree()) as BookmarkNode[];
  },

  /**
   * Wrap bookmarks with metadata
   */
  async createCloudBackup(): Promise<CloudBackup> {
    const tree = await this.getTree();
    const count = this.countBookmarks(tree);
    const browserInfo = getBrowserInfo();

    const metadata: BookmarkMetadata = {
      timestamp: Date.now(),
      totalCount: count,
      clientVersion: "1.0.0",
      browser: browserInfo.name,
      browserVersion: browserInfo.version,
      stats: {
        totalFolders: this.countFolders(tree),
      },
    };

    return {
      metadata,
      data: tree,
    };
  },

  /**
   * 标准化 URL 用于比较
   * 去除末尾斜杠、统一小写协议、去除空格
   */
  normalizeUrl(url: string | undefined): string {
    if (!url) return "";
    return url
      .trim()
      .replace(/\/+$/, "") // 去除末尾斜杠
      .replace(/^(https?):\/\//i, (_, proto) => proto.toLowerCase() + "://"); // 统一协议小写
  },

  /**
   * 增量同步：只更新差异部分
   * @param parentId 父文件夹 ID
   * @param cloudNodes 云端节点列表
   * @param localNodes 本地节点列表
   */
  async syncNodes(
    parentId: string,
    cloudNodes: BookmarkNode[],
    localNodes: BookmarkNode[],
  ): Promise<void> {
    // 用于跟踪已匹配的本地节点，防止重复匹配
    const matchedLocalIds = new Set<string>();

    // 第一遍：处理云端节点（新增/更新）
    for (const cloudNode of cloudNodes) {
      let matchedLocal: BookmarkNode | undefined;

      if (cloudNode.url) {
        // 书签：按 URL 匹配（标准化后比较）
        const cloudUrl = this.normalizeUrl(cloudNode.url);
        matchedLocal = localNodes.find(
          (local) =>
            this.normalizeUrl(local.url) === cloudUrl &&
            !matchedLocalIds.has(local.id),
        );
      } else {
        // 文件夹：按 title 匹配（忽略前后空格）
        const cloudTitle = cloudNode.title?.trim() || "";
        matchedLocal = localNodes.find(
          (local) =>
            !local.url &&
            (local.title?.trim() || "") === cloudTitle &&
            !matchedLocalIds.has(local.id),
        );
      }

      if (matchedLocal) {
        // 已存在，标记为已匹配
        matchedLocalIds.add(matchedLocal.id);

        if (cloudNode.url) {
          // 书签：检查标题是否需要更新
          if (
            (matchedLocal.title?.trim() || "") !==
            (cloudNode.title?.trim() || "")
          ) {
            await BookmarksAPI.update(matchedLocal.id, {
              title: cloudNode.title,
            });
          }
        } else {
          // 文件夹：递归同步子节点（即使云端是空文件夹也需要同步，以清理本地多余内容）
          const localChildren = await BookmarksAPI.getChildren(matchedLocal.id);
          await this.syncNodes(
            matchedLocal.id,
            cloudNode.children || [],
            localChildren as BookmarkNode[],
          );
        }
      } else {
        // 本地不存在，创建新节点
        const created = await BookmarksAPI.create({
          parentId,
          title: cloudNode.title,
          url: cloudNode.url,
        });

        // 如果是文件夹，递归创建子节点
        if (cloudNode.children && cloudNode.children.length > 0) {
          await this.createChildren(created.id, cloudNode.children);
        }
      }
    }

    // 第二遍：删除本地多余的节点（云端没有的）
    for (const localNode of localNodes) {
      if (!matchedLocalIds.has(localNode.id)) {
        // 本地存在但云端没有，删除
        try {
          if (localNode.url) {
            // 书签：直接删除
            await BookmarksAPI.remove(localNode.id);
          } else {
            // 文件夹：递归删除
            await BookmarksAPI.removeTree(localNode.id);
          }
        } catch {
          // 忽略删除失败（可能是特殊文件夹）
        }
      }
    }
  },

  /**
   * Restore bookmarks from CloudBackup (or legacy array) - 增量同步版本
   */
  async restoreFromBackup(backup: CloudBackup | BookmarkNode[]): Promise<void> {
    let tree: BookmarkNode[];

    if (Array.isArray(backup)) {
      // Legacy format support
      tree = backup;
    } else if (backup && backup.data) {
      tree = backup.data;
    } else {
      throw new Error("备份数据格式无效");
    }

    if (!tree || tree.length === 0) {
      throw new Error("备份数据为空");
    }

    const root = tree[0];

    if (!root || !root.children) {
      throw new Error("备份数据格式无效：缺少根节点或子节点");
    }

    // 获取当前浏览器的根文件夹
    const localTree = await this.getTree();
    const localRoot = localTree[0];

    if (!localRoot || !localRoot.children) {
      throw new Error("无法获取本地书签根结构");
    }

    const localChildren = localRoot.children;

    // 使用增量同步恢复内容
    for (const backupChild of root.children) {
      const targetFolder = findMatchingSystemFolder(backupChild, localChildren);

      if (targetFolder && backupChild.children) {
        const localFolderChildren = await BookmarksAPI.getChildren(
          targetFolder.id,
        );
        await this.syncNodes(
          targetFolder.id,
          backupChild.children,
          localFolderChildren as BookmarkNode[],
        );
      }
      // 如果找不到对应的文件夹，跳过这个备份文件夹（不要用 fallback，避免数据错乱）
    }
  },

  async emptyFolder(id: string): Promise<void> {
    const children = await BookmarksAPI.getChildren(id);

    for (const child of children) {
      await BookmarksAPI.removeTree(child.id);
    }
  },

  async createChildren(parentId: string, children: BookmarkNode[]) {
    for (const node of children) {
      const created = await BookmarksAPI.create({
        parentId: parentId,
        title: node.title,
        url: node.url,
        index: node.index,
      });

      if (node.children && node.children.length > 0) {
        await this.createChildren(created.id, node.children);
      }
    }
  },

  countBookmarks(nodes: BookmarkNode[]): number {
    let count = 0;
    for (const node of nodes) {
      if (node.url) {
        count++;
      }
      if (node.children && node.children.length > 0) {
        count += this.countBookmarks(node.children);
      }
    }
    return count;
  },

  countFolders(nodes: BookmarkNode[]): number {
    let count = 0;
    for (const node of nodes) {
      if (!node.url && node.children) {
        // Is folder
        if (node.id !== "0") count++; // Skip root
        count += this.countFolders(node.children);
      }
    }
    return count;
  },

  async mergeFromBackup(backup: CloudBackup | BookmarkNode[]): Promise<void> {
    let tree: BookmarkNode[];

    if (Array.isArray(backup)) {
      tree = backup;
    } else {
      tree = backup.data;
    }

    const root = tree[0];
    if (!root || !root.children) {
      throw new Error("Invalid bookmark backup format");
    }

    // Iterate root children (usually "1" and "2")
    for (const child of root.children) {
      if (child.id === "1" || child.id === "2") {
        await this.mergeNodes(child.id, child.children || []);
      }
    }
  },

  async mergeNodes(parentId: string, nodes: BookmarkNode[]) {
    const localChildren = await BookmarksAPI.getChildren(parentId);

    for (const node of nodes) {
      if (node.url) {
        // Bookmark: Check by URL
        const exists = localChildren.some((local) => local.url === node.url);
        if (!exists) {
          await BookmarksAPI.create({
            parentId,
            title: node.title,
            url: node.url,
            index: node.index,
          });
        }
      } else {
        // Folder: Check by Title
        const existingFolder = localChildren.find(
          (local) => !local.url && local.title === node.title,
        );

        if (existingFolder) {
          // Folder exists, merge contents
          if (node.children && node.children.length > 0) {
            await this.mergeNodes(existingFolder.id, node.children);
          }
        } else {
          // New folder, create and populate
          const newFolder = await BookmarksAPI.create({
            parentId,
            title: node.title,
            index: node.index,
          });

          if (node.children && node.children.length > 0) {
            // Optimized: Create whole subtree without checking
            await this.createChildren(newFolder.id, node.children);
          }
        }
      }
    }
  },

  async getLocalCount(): Promise<number> {
    const tree = await this.getTree();
    return this.countBookmarks(tree);
  },

  /**
   * 提取书签和文件夹的内容签名列表（用于比对）
   * - 书签: "B|URL|Title"
   * - 文件夹: "F|Title|ChildCount"
   */
  extractSignatures(nodes: BookmarkNode[]): string[] {
    const signatures: string[] = [];

    for (const node of nodes) {
      if (!isSystemRootFolder(node)) {
        if (node.url) {
          signatures.push(`B|${node.url.trim()}|${node.title.trim()}`);
        } else {
          signatures.push(
            `F|${node.title.trim()}|${node.children?.length ?? 0}`,
          );
        }
      }

      if (node.children?.length) {
        signatures.push(...this.extractSignatures(node.children));
      }
    }

    return signatures.sort();
  },

  /** 比对本地书签和云端书签是否一致 */
  compareWithCloud(
    localTree: BookmarkNode[],
    cloudData: CloudBackup | BookmarkNode[],
  ): boolean {
    const cloudTree = Array.isArray(cloudData) ? cloudData : cloudData.data;

    const localSigs = this.extractSignatures(localTree);
    const cloudSigs = this.extractSignatures(cloudTree);

    if (localSigs.length !== cloudSigs.length) return false;

    for (let i = 0; i < localSigs.length; i++) {
      if (localSigs[i] !== cloudSigs[i]) return false;
    }

    return true;
  },
};
