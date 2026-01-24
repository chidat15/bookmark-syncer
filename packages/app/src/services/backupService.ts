import { openDB, IDBPDatabase } from "idb";
import { BookmarkNode } from "../types";

interface Snapshot {
  id: number;
  timestamp: number;
  tree: BookmarkNode[];
  reason: string; // 'auto-backup' | 'manual'
  count: number;
}

const DB_NAME = "bookmark-syncer-db";
const STORE_NAME = "snapshots";

export const BackupService = {
  async getDb(): Promise<IDBPDatabase> {
    return openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      },
    });
  },

  async createSnapshot(
    tree: BookmarkNode[],
    count: number,
    reason: string = "auto-backup",
  ): Promise<number> {
    const db = await this.getDb();
    const snapshot: Omit<Snapshot, "id"> = {
      timestamp: Date.now(),
      tree,
      reason,
      count,
    };
    const id = await db.add(STORE_NAME, snapshot);

    // Keep only last 10 snapshots
    const keys = await db.getAllKeys(STORE_NAME);
    if (keys.length > 10) {
      const toDelete = keys.slice(0, keys.length - 10);
      for (const k of toDelete) {
        await db.delete(STORE_NAME, k);
      }
    }

    return id as number;
  },

  async getLatestSnapshot(): Promise<Snapshot | undefined> {
    const db = await this.getDb();
    const keys = await db.getAllKeys(STORE_NAME);
    if (keys.length === 0) return undefined;

    const lastKey = keys[keys.length - 1];
    return db.get(STORE_NAME, lastKey);
  },

  async getAllSnapshots(): Promise<Snapshot[]> {
    const db = await this.getDb();
    const snapshots = await db.getAll(STORE_NAME);
    // 按时间倒序返回
    return snapshots.sort((a, b) => b.timestamp - a.timestamp);
  },

  async getSnapshotById(id: number): Promise<Snapshot | undefined> {
    const db = await this.getDb();
    return db.get(STORE_NAME, id);
  },

  async deleteSnapshot(id: number): Promise<void> {
    const db = await this.getDb();
    await db.delete(STORE_NAME, id);
  },
};

export type { Snapshot };
