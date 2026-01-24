/**
 * 扩展后台脚本入口
 * 初始化自动同步和定时同步
 */
import browser from "webextension-polyfill";
import {
  startAutoSync,
  checkCloudOnStartup,
  startScheduledSync,
} from "./autoSync";

/** 初始化后台服务 */
export function initBackground(): void {
  // 扩展安装或更新时
  browser.runtime.onInstalled.addListener(() => {
    startAutoSync();
    startScheduledSync();
  });

  // 扩展启动时
  browser.runtime.onStartup.addListener(() => {
    startAutoSync();
    startScheduledSync();
    checkCloudOnStartup();
  });

  // 立即启动（用于开发时热重载）
  startAutoSync();
  startScheduledSync();
}
