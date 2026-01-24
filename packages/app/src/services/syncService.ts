/**
 * 统一同步服务
 * 提供自动同步、手动同步、定时同步共用的核心逻辑
 */
import browser from "webextension-polyfill";
import { BookmarkService } from "./bookmarkService";
import { BackupService } from "./backupService";
import { createWebDAVClient, WebDAVClient } from "./webdav";
import { CloudBackup } from "../types";

// ============ 同步锁 ============

const LOCK_KEY = "sync_lock";
const LOCK_TIMEOUT_MS = 60000; // 60 秒超时自动释放

interface SyncLock {
  holder: string;
  timestamp: number;
}

/**
 * 尝试获取同步锁
 */
async function acquireSyncLock(holder: string): Promise<boolean> {
  const result = await browser.storage.local.get(LOCK_KEY);
  const existingLock = result[LOCK_KEY] as SyncLock | undefined;

  if (existingLock) {
    const now = Date.now();
    if (now - existingLock.timestamp < LOCK_TIMEOUT_MS) {
      return false;
    }
  }

  const newLock: SyncLock = { holder, timestamp: Date.now() };
  await browser.storage.local.set({ [LOCK_KEY]: newLock });
  return true;
}

/**
 * 释放同步锁
 */
async function releaseSyncLock(holder: string): Promise<void> {
  const result = await browser.storage.local.get(LOCK_KEY);
  const existingLock = result[LOCK_KEY] as SyncLock | undefined;

  if (existingLock && existingLock.holder === holder) {
    await browser.storage.local.remove(LOCK_KEY);
  }
}

// ============ 配置和类型 ============

export interface SyncConfig {
  url: string;
  username: string;
  password: string;
}

export interface SyncResult {
  success: boolean;
  action: "uploaded" | "downloaded" | "skipped" | "error";
  message: string;
}

const DIR = "BookmarkSyncer";
const FILE = `${DIR}/bookmarks.json`;

/**
 * 获取 WebDAV 客户端
 */
function getClient(config: SyncConfig): WebDAVClient {
  return createWebDAVClient({
    url: config.url,
    username: config.username,
    password: config.password,
  });
}

/**
 * 智能上传：检查内容差异，只有真正有变化时才上传
 * @param config WebDAV 配置
 * @param lockHolder 锁持有者标识
 * @param createSnapshot 是否在上传前创建本地快照
 */
export async function smartPush(
  config: SyncConfig,
  lockHolder: string,
  createSnapshot = false,
): Promise<SyncResult> {
  // 检查网络
  if (!navigator.onLine) {
    return { success: false, action: "error", message: "网络断开" };
  }

  // 获取锁
  const lockAcquired = await acquireSyncLock(lockHolder);
  if (!lockAcquired) {
    return { success: false, action: "error", message: "同步正在进行中" };
  }

  try {
    const client = getClient(config);

    // 1. 获取本地书签
    const localTree = await BookmarkService.getTree();
    const localCount = BookmarkService.countBookmarks(localTree);

    // 安全检查：书签为空时不同步
    if (localCount === 0) {
      return { success: false, action: "error", message: "本地书签为空" };
    }

    // 2. 获取云端数据并比对
    try {
      const cloudJson = await client.getFile(FILE);
      if (cloudJson) {
        const cloudData = JSON.parse(cloudJson) as CloudBackup;

        // 检查云端是否有未拉取的新版本
        const cloudTime = cloudData.metadata?.timestamp || 0;
        const result = await browser.storage.local.get([
          "lastSyncTime",
          "lastSyncUrl",
        ]);
        const lastSyncTime =
          result.lastSyncUrl === config.url
            ? (result.lastSyncTime as number) || 0
            : 0;

        if (cloudTime > lastSyncTime) {
          return {
            success: false,
            action: "error",
            message: "云端有更新，请先拉取",
          };
        }

        // 比对内容
        const isIdentical = BookmarkService.compareWithCloud(
          localTree,
          cloudData,
        );
        if (isIdentical) {
          // 内容相同，只更新同步时间
          await browser.storage.local.set({
            lastSyncTime: Date.now(),
            lastSyncUrl: config.url,
            lastSyncType: "skip_identical",
          });
          return {
            success: true,
            action: "skipped",
            message: "书签已同步，无需更新",
          };
        }
      }
    } catch {
      // 云端文件不存在或无法获取，继续上传
    }

    // 3. 创建快照（可选）
    if (createSnapshot) {
      await BackupService.createSnapshot(localTree, localCount, "上传前备份");
    }

    // 4. 执行上传
    const backup = await BookmarkService.createCloudBackup();

    if (!(await client.exists(DIR))) {
      await client.createDirectory(DIR);
    }

    await client.putFile(FILE, JSON.stringify(backup));

    // 5. 更新同步时间
    await browser.storage.local.set({
      lastSyncTime: Date.now(),
      lastSyncUrl: config.url,
      lastSyncType: "upload",
    });

    return { success: true, action: "uploaded", message: "上传成功" };
  } catch (error) {
    return {
      success: false,
      action: "error",
      message: (error as Error).message || "上传失败",
    };
  } finally {
    await releaseSyncLock(lockHolder);
  }
}

/**
 * 智能下载：拉取云端数据并恢复到本地
 * @param config WebDAV 配置
 * @param lockHolder 锁持有者标识
 * @param mode 恢复模式：overwrite（覆盖）或 merge（合并）
 */
export async function smartPull(
  config: SyncConfig,
  lockHolder: string,
  mode: "overwrite" | "merge" = "overwrite",
): Promise<SyncResult> {
  // 检查网络
  if (!navigator.onLine) {
    return { success: false, action: "error", message: "网络断开" };
  }

  // 获取锁
  const lockAcquired = await acquireSyncLock(lockHolder);
  if (!lockAcquired) {
    return { success: false, action: "error", message: "同步正在进行中" };
  }

  try {
    const client = getClient(config);

    // 1. 下载云端数据
    const json = await client.getFile(FILE);
    if (!json) {
      return { success: false, action: "error", message: "云端无数据" };
    }

    const cloudData = JSON.parse(json) as CloudBackup;

    // 2. 创建恢复前快照
    const currentTree = await BookmarkService.getTree();
    const currentCount = await BookmarkService.getLocalCount();
    await BackupService.createSnapshot(currentTree, currentCount, "恢复前备份");

    // 3. 恢复
    if (mode === "overwrite") {
      await BookmarkService.restoreFromBackup(cloudData);
    } else {
      await BookmarkService.mergeFromBackup(cloudData);
    }

    // 4. 更新同步时间
    await browser.storage.local.set({
      lastSyncTime: Date.now(),
      lastSyncUrl: config.url,
      lastSyncType: "download",
    });

    return { success: true, action: "downloaded", message: "同步完成" };
  } catch (error) {
    return {
      success: false,
      action: "error",
      message: (error as Error).message || "恢复失败",
    };
  } finally {
    await releaseSyncLock(lockHolder);
  }
}

/**
 * 云端信息
 */
export interface CloudInfo {
  exists: boolean;
  timestamp?: number;
  totalCount?: number;
  browser?: string;
  browserVersion?: string;
}

/**
 * 获取云端备份信息（不需要锁）
 */
export async function getCloudInfo(config: SyncConfig): Promise<CloudInfo> {
  if (!navigator.onLine) {
    return { exists: false };
  }

  try {
    const client = getClient(config);
    const json = await client.getFile(FILE);
    if (!json) {
      return { exists: false };
    }

    const data = JSON.parse(json) as CloudBackup;
    return {
      exists: true,
      timestamp: data.metadata?.timestamp,
      totalCount: data.metadata?.totalCount,
      browser: data.metadata?.browser,
      browserVersion: data.metadata?.browserVersion,
    };
  } catch {
    return { exists: false };
  }
}

/**
 * 智能同步结果
 */
export interface SmartSyncResult extends SyncResult {
  needsConflictResolution?: boolean;
  cloudInfo?: CloudInfo;
}

/**
 * 智能同步：自动判断推送或拉取
 * @param config WebDAV 配置
 * @param lockHolder 锁持有者标识
 */
export async function smartSync(
  config: SyncConfig,
  lockHolder: string,
): Promise<SmartSyncResult> {
  // 检查网络
  if (!navigator.onLine) {
    return { success: false, action: "error", message: "网络断开" };
  }

  // 获取锁
  const lockAcquired = await acquireSyncLock(lockHolder);
  if (!lockAcquired) {
    return { success: false, action: "error", message: "同步正在进行中" };
  }

  try {
    const client = getClient(config);

    // 1. 获取本地书签
    const localTree = await BookmarkService.getTree();

    // 2. 获取云端数据
    let cloudData: CloudBackup | null = null;
    let cloudInfo: CloudInfo = { exists: false };

    try {
      const json = await client.getFile(FILE);
      if (json) {
        cloudData = JSON.parse(json) as CloudBackup;
        cloudInfo = {
          exists: true,
          timestamp: cloudData.metadata?.timestamp,
          totalCount: cloudData.metadata?.totalCount,
          browser: cloudData.metadata?.browser,
          browserVersion: cloudData.metadata?.browserVersion,
        };
      }
    } catch {
      // 云端无数据
    }

    // Case A: 云端无数据 → 直接上传
    if (!cloudData) {
      // 释放锁后重新调用 smartPush（它会获取自己的锁）
      await releaseSyncLock(lockHolder);
      return await smartPush(config, lockHolder, false);
    }

    // 3. 比对内容
    const isIdentical = BookmarkService.compareWithCloud(localTree, cloudData);
    if (isIdentical) {
      await browser.storage.local.set({
        lastSyncTime: Date.now(),
        lastSyncUrl: config.url,
        lastSyncType: "skip_identical",
      });
      return {
        success: true,
        action: "skipped",
        message: "书签已同步，无需操作",
        cloudInfo,
      };
    }

    // 4. 检查是否需要用户选择
    const storage = await browser.storage.local.get([
      "lastSyncTime",
      "lastSyncUrl",
    ]);
    const lastSyncUrl = storage.lastSyncUrl as string | undefined;
    let lastSyncTime =
      lastSyncUrl === config.url ? (storage.lastSyncTime as number) || 0 : 0;
    const cloudTime = cloudData.metadata?.timestamp || 0;

    // 首次同步或环境变更，且云端有数据 → 需要用户选择
    if (
      lastSyncTime === 0 &&
      cloudInfo.totalCount &&
      cloudInfo.totalCount > 0
    ) {
      return {
        success: false,
        action: "error",
        message: "需要选择同步方向",
        needsConflictResolution: true,
        cloudInfo,
      };
    }

    // 5. 智能判断
    if (cloudTime > lastSyncTime) {
      // 云端比本地新 → 拉取
      // 释放锁后重新调用
      await releaseSyncLock(lockHolder);
      const result = await smartPull(config, lockHolder, "overwrite");
      return { ...result, cloudInfo };
    } else {
      // 本地可能更新 → 上传
      await releaseSyncLock(lockHolder);
      const result = await smartPush(config, lockHolder, false);
      return { ...result, cloudInfo };
    }
  } catch (error) {
    return {
      success: false,
      action: "error",
      message: (error as Error).message || "同步失败",
    };
  } finally {
    // 确保锁被释放（如果还持有的话）
    await releaseSyncLock(lockHolder);
  }
}

/**
 * 检查是否需要用户选择同步方向（用于 UI 预检）
 */
export async function checkNeedsConflictResolution(
  config: SyncConfig,
): Promise<{ needsResolution: boolean; cloudInfo: CloudInfo }> {
  const cloudInfo = await getCloudInfo(config);
  if (!cloudInfo.exists) {
    return { needsResolution: false, cloudInfo };
  }

  const storage = await browser.storage.local.get([
    "lastSyncTime",
    "lastSyncUrl",
  ]);
  const lastSyncUrl = storage.lastSyncUrl as string | undefined;
  const lastSyncTime =
    lastSyncUrl === config.url ? (storage.lastSyncTime as number) || 0 : 0;

  // 首次同步且云端有数据
  if (lastSyncTime === 0 && cloudInfo.totalCount && cloudInfo.totalCount > 0) {
    return { needsResolution: true, cloudInfo };
  }

  return { needsResolution: false, cloudInfo };
}
