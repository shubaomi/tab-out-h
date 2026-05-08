# Tab Out 快捷网址扩展 — 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Tab Out 扩展中新增快捷网址配置与循环跳转功能：用户配置多个常用网址，每次打开新标签页时按顺序打开其中一个，所有都打开过后回到仪表盘。

**Architecture:** 使用 chrome.storage.local 持久化配置；background.js service worker 在新标签页创建时直接查询当前打开的 tabs（无 session 缓存），判断是否有未打开的配置 URL，有则 redirect；dashboard 顶部添加可折叠配置区。

**Tech Stack:** Chrome Manifest V3 Extension, chrome.storage.local, chrome.tabs API

---

## 文件结构

```
extension/
├── background.js   ← 修改：新增 stateless redirect 逻辑（chrome.tabs.onCreated + chrome.tabs.update）
├── app.js           ← 修改：新增配置区渲染 + storage 读写 + 事件绑定
├── style.css       ← 修改：新增配置区样式 + 展开动画
├── index.html      ← 修改：顶部添加配置区 DOM
├── manifest.json   ← 修改：新增 webNavigation 权限
└── config.local.js ← 不变（已有机制，本次不使用）
```

---

## 实现说明（最终方案 vs 原计划）

### 关键差异：完全无 session 缓存

原计划使用 `sessionState.openedIDs` 跟踪已打开的 URL，但实践中发现：
- Service Worker 重启后 `sessionState` 会重置
- 维护"已打开 ID"集合需要额外的清理逻辑，且清理时机难以保证
- **更好的方案**：每次 `onCreated` 时直接查询当前所有真实打开的 tabs，按 URL 匹配判断哪些配置 URL 当前没开着

### 最终 redirect 流程

```
新标签页创建
  → chrome.tabs.onCreated 触发
  → chrome.tabs.query({}) 查询所有当前打开的 tabs
  → chrome.storage.local.get('quickURLs') 读取配置
  → 找出第一个"当前没开着"的配置 URL
  → chrome.tabs.update(tabId, { url: targetUrl }) 重定向
```

优势：
- 无 session 状态 → Service Worker 重启不影响
- 用户关闭 tab → 再次开新标签自动重新检测到它"没开"
- 不需要追踪 tab ID，不需要 pendingTabIds，不需要 cleanup 逻辑

---

## Chunk 1: background.js — Service Worker 拦截逻辑

**文件:**
- Modify: `extension/background.js`

- [x] **Step 1: 移除 sessionState，添加 normalizeUrl + stateless redirect 逻辑**

```javascript
// ================================================================
// NEW TAB INTERCEPTOR
// Always check current real tabs — no session cache needed
// ================================================================

/**
 * Normalize URL for comparison — strip trailing slash
 */
function normalizeUrl(url) {
  return url ? url.replace(/\/$/, '') : '';
}

chrome.tabs.onCreated.addListener(async (tab) => {
  // Query all currently open tabs
  const allTabs = await chrome.tabs.query({});
  const openUrls = new Set(allTabs.map(t => normalizeUrl(t.url)));

  // Read quick URL config
  const stored = await chrome.storage.local.get('quickURLs');
  const items = stored.quickURLs;
  if (!items || items.length === 0) return; // No config — let dashboard load

  // Find the first configured URL that is NOT currently open
  const target = items.find(item => !openUrls.has(normalizeUrl(item.url)));
  if (!target) return; // All URLs already open — show dashboard

  await chrome.tabs.update(tab.id, { url: target.url });
});
```

- [x] **Step 2: 提交 Chunk 1**

```bash
git add extension/background.js
git commit -m "feat: add stateless quick URLs redirect in background.js"
```

---

## Chunk 2: index.html — 添加配置区 DOM

**文件:**
- Modify: `extension/index.html`（在 `</header>` 标签后、`<div class="dashboard-columns">` 前插入配置区）

- [x] **Step 1: 在 header 闭合标签后添加配置区 HTML + tab 选择弹窗 HTML**

插入内容：quicks-urls-panel、quicks-tab-modal（在 `dashboard-columns` 之前）

- [x] **Step 2: 提交 Chunk 2**

```bash
git add extension/index.html
git commit -m "feat: add quick URLs config panel DOM in index.html"
```

---

## Chunk 3: style.css — 配置区样式

**文件:**
- Modify: `extension/style.css`（在文件末尾添加新样式）

- [x] **Step 1: 添加配置区样式** — CSS 变量、面板、卡片、弹窗样式

- [x] **Step 2: 提交 Chunk 3**

```bash
git add extension/style.css
git commit -m "feat: add quick URLs panel and tab selector modal styles"
```

---

## Chunk 4: app.js — 配置区渲染与交互逻辑

**文件:**
- Modify: `extension/app.js`（在文件末尾添加新逻辑）

- [x] **Step 1: 添加存储函数** — `getQuickURLs()`, `saveQuickURLs()`, `generateQuickURLItem()`, `addQuickURL()`, `removeQuickURL()`, `reorderQuickURLs()`
  - 注意：`addQuickURL` 使用 `push()` 而非 `unshift()`，确保先配置的 URL 在列表前面、也先被 redirect

- [x] **Step 2: 添加面板渲染** — `renderQuickURLsPanel()`, `renderQuickURLCard()`（XSS 安全）

- [x] **Step 3: 添加 Tab 选择弹窗** — `openTabSelectorModal()`, `closeTabSelectorModal()`，弹窗列出所有可添加的 tabs，支持搜索过滤

- [x] **Step 4: 添加事件绑定** — 点击展开/收起、添加当前 Tab、删除 URL、输入框添加、拖拽排序

- [x] **Step 5: 初始化调用** — `renderDashboard()` 末尾调用 `renderQuickURLsPanel()`

- [x] **Step 6: 提交 Chunk 4**

```bash
git add extension/app.js
git commit -m "feat: add quick URLs config panel rendering and interactions"
```

---

## Chunk 5: manifest.json — 权限补充

**文件:**
- Modify: `extension/manifest.json`

- [x] **Step 1: 添加 `webNavigation` 权限**

```json
"permissions": ["tabs", "activeTab", "storage", "scripting", "webNavigation"],
```

- [x] **Step 2: 提交 Chunk 5**

```bash
git add extension/manifest.json
git commit -m "feat: add webNavigation permission for future navigation events"
```

---

## 集成验证

- [x] **Step 1: 加载扩展**
  1. Chrome → `chrome://extensions`
  2. 开发者模式开启
  3. 点击「加载已解压的扩展程序」
  4. 选择 `extension/` 文件夹

- [x] **Step 2: 基本功能测试**
  1. 打开新标签页 → 应显示 Tab Out 仪表盘（配置区为空时面板显示空状态）
  2. 点击「添加当前 Tab」→ 应弹出 tab 选择框
  3. 选择一个 tab → 应添加到配置区（URL 输入框也可直接添加）
  4. 再次打开新标签页 → **此时应 redirect 到刚配置的 URL**（因为有配置且该 URL 未打开过）
  5. 关闭该 URL tab，再次打开新标签页 → **该 URL 应重新参与循环**

- [x] **Step 3: 多 URL 循环测试**
  1. 配置 A、B、C 三个 URL（A 先配置，B 后配置）
  2. 新标签页 #1 → A（第一个配置的）
  3. 新标签页 #2 → B（第二个配置的）
  4. 新标签页 #3 → C
  5. 新标签页 #4 → 仪表盘（A/B/C 都已打开过）
  6. 新标签页 #5 → A（重新开始循环，因为上一个检测到全开着）

- [x] **Step 4: 验证配置区样式**
  1. 配置区展开/收起动画是否平滑
  2. 删除按钮 hover 时是否正常显示
  3. 拖拽排序是否工作
  4. 面板始终可见（无论是否有配置）
