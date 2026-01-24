# 书签同步插件 (Bookmark Syncer) 设计规范与方向

## 1. 产品愿景

打造一款 **跨浏览器**、**即插即用**、**隐私优先** 的书签同步工具。
核心理念：

- **Privacy First**: 数据完全掌握在用户手中 (WebDAV)，不依赖第三方专有服务器。
- **Premium UX**: 极致流畅、现代化、美观的用户界面，摆脱传统开源软件的简陋感。
- **Agnostic**: 适配所有主流浏览器 (Chrome/Edge, Firefox, Safari)。

## 2. 核心功能 (MVP)

1.  **WebDAV 配置**: 支持用户输入 WebDAV 地址、用户名、密码。
2.  **手动/自动同步**:
    - **Push**: 本地书签覆盖/合并到云端。
    - **Pull**: 云端书签覆盖/合并到本地。
    - **Auto**: 定时同步或变更检测同步（后期支持）。
3.  **冲突解决**: 简单的“本地优先”或“云端优先”策略，后期支持智能合并。
4.  **跨平台一致性**: 在 Chrome 和 Firefox 上提供完全一致的体验。

## 3. UI/UX 设计方向

**风格**: Modern Clean (参考 Vercel / Linear 的设计语言)
**配色**:

- 主色调: Indigo / Violet (科技感且柔和)
- 背景: 纯净白 (Light) / 深灰黑 (Dark Mode)
- 字体: Inter / System UI

**交互**:

- **即时反馈**: 点击同步按钮要有清晰的 Loading 动画和成功/失败触感。
- **设置页**: 沉浸式设置面板，非弹窗式。
- **Popup**: 极简状态栏，显示最后同步时间、当前状态、一键同步按钮。

## 4. 技术架构 (Monorepo)

### 目录结构

```text
/
├── apps/
│   ├── chrome-extension/  # Chrome/Edge 适配层 (Vite + CRXJS)
│   └── firefox-extension/ # Firefox 适配层
├── packages/
│   ├── core/              # 核心逻辑 (WebDAV Client, Bookmark Tree Parser, Types)
│   ├── ui/                # 共享 UI 组件库 (React + TailwindCSS)
│   └── utils/             # 通用工具函数
```

### 技术栈

- **语言**: TypeScript (Strict Mode)
- **构建工具**: TurboRepo (可选) + Vite
- **UI 框架**: React
- **样式**: TailwindCSS (配合 `clsx` / `tailwind-merge`)
- **状态管理**: Zustand (轻量级，支持持久化)
- **WebDAV 客户端**: `webdav` (npm package) 或原生 fetch 封装
- **图标库**: Lucide React

## 5. 数据模型

云端存储格式建议为标准 `JSON`，包含元数据以支持差异比对：

```json
{
  "version": 1,
  "lastSync": "2024-01-23T12:00:00Z",
  "deviceId": "uuid-...",
  "roots": {
    "bookmark_bar": [ ... ],
    "other": [ ... ]
  }
}
```

## 6. 开发路线图

- [x] Monorepo 初始化
- [ ] **Phase 1 (Prototype)**: `packages/core` 实现 WebDAV 连接测试，`apps/chrome-extension` 跑通基本的 Manifest V3。
- [ ] **Phase 2 (UI)**: 搭建 `packages/ui`，实现精美的配置界面。
- [ ] **Phase 3 (Logic)**: 实现书签树的递归解析与 JSON 互转。
- [ ] **Phase 4 (Sync)**: 实现核心同步逻辑 (Upload/Download)。
