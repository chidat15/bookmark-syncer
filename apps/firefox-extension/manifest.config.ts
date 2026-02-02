import { defineManifest } from "@crxjs/vite-plugin";

// @ts-ignore
import { version } from "../../package.json";

const manifest = defineManifest({
  manifest_version: 3,
  name: "书签同步助手",
  version: version,
  description: "基于 WebDAV 的现代化跨设备书签同步工具",
  action: {
    default_popup: "index.html",
    default_icon: {
      "16": "icon-16.png",
      "32": "icon-32.png",
      "48": "icon-48.png",
      "128": "icon.png",
    },
  },
  permissions: ["bookmarks", "storage", "alarms"],
  host_permissions: ["<all_urls>"],
  background: {
    scripts: ["src/background.ts"],
    type: "module",
  },
  icons: {
    "16": "icon-16.png",
    "32": "icon-32.png",
    "48": "icon-48.png",
    "128": "icon.png",
  },
});

// Firefox 特定配置 - 手动添加到最终 manifest
// @ts-expect-error Firefox-specific property not in Chrome types
manifest.browser_specific_settings = {
  gecko: {
    id: "bookmark-syncer@example.com",
    strict_min_version: "140.0", // 需要 140+ 才支持 data_collection_permissions
  },
};

// data_collection_permissions 需要 Firefox 140+，必须是对象格式
// @ts-expect-error Firefox-specific property
manifest.browser_specific_settings.gecko.data_collection_permissions = {};

export default manifest;
