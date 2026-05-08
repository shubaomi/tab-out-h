# Tab Out 快捷网址扩展 — 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Tab Out 扩展中新增快捷网址配置与循环跳转功能：用户配置多个常用网址，每次打开新标签页时按顺序打开其中一个，所有都打开过后回到仪表盘。

**Architecture:** 使用 chrome.storage.local 持久化配置；background.js service worker 在新标签页创建时判断是否 redirect；dashboard 顶部添加可折叠配置区。

**Tech Stack:** Chrome Manifest V3 Extension, chrome.storage.local, chrome.scripting API

---

## 文件结构

```
extension/
├── background.js   ← 修改：新增 sessionState + tabs.onCreated 拦截 + redirect 逻辑
├── app.js           ← 修改：新增配置区渲染 + storage 读写 + 事件绑定
├── style.css       ← 修改：新增配置区样式 + 展开动画
├── index.html      ← 修改：顶部添加配置区 DOM
└── config.local.js ← 不变（已有机制，本次不使用）
```

---

## Chunk 1: background.js — Service Worker 拦截逻辑

**文件:**
- Modify: `extension/background.js`

- [ ] **Step 1: 在 background.js 顶部添加 sessionState 和辅助函数**

```javascript
// ================================================================
// SESSION STATE — 仅进程内存，浏览器关闭后重置
// ================================================================
let sessionState = {
  openedIDs: [],      // 本 session 已打开过的 quickURL id 列表
  lastTargetURL: null // 上一次 redirect 目标 URL
};

/**
 * isTabOutPage(url)
 * 判断 URL 是否为 Tab Out 自身的新标签页
 */
function isTabOutPage(url) {
  if (!url) return false;
  return url === 'chrome://newtab/' ||
         url.startsWith('chrome-extension://') && url.endsWith('/index.html');
}

/**
 * getNextQuickURL(items)
 * 从配置列表中返回下一个应该打开的 URL
 * 规则：从 items 中过滤掉已打开的，取第一个；如果全部已打开，返回 null
 */
function getNextQuickURL(items) {
  if (!items || items.length === 0) return null;
  const unopened = items.filter(item => !sessionState.openedIDs.includes(item.id));
  if (unopened.length === 0) return null;
  return unopened[0];
}
```

- [ ] **Step 2: 添加 redirect 函数**

```javascript
/**
 * redirectTab(tabId, targetURL)
 * 向指定 tab 注入脚本，执行 window.location.href = targetURL
 */
async function redirectTab(tabId, targetURL) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (url) => { window.location.href = url; },
      args: [targetURL]
    });
  } catch (err) {
    console.warn('[tab-out] redirect failed:', err);
  }
}
```

- [ ] **Step 3: 添加 chrome.tabs.onCreated 监听器（在文件末尾）**

```javascript
// ================================================================
// NEW TAB INTERCEPTOR
// ================================================================

/**
 * 检查上一个 redirect 目标的 tab 是否仍存在
 * 如果已被用户关闭（tab 不存在），则将其从 openedIDs 移除，使其重新参与循环
 */
async function cleanupClosedTabs() {
  if (!sessionState.lastTargetURL) return;

  const allTabs = await chrome.tabs.query({});
  const stillOpen = allTabs.some(t => t.url === sessionState.lastTargetURL);

  if (!stillOpen && sessionState.lastTargetURL) {
    // 需要逆向查找 sessionState 中哪个 id 对应这个 URL
    // 由于 lastTargetURL 存储的是 URL 而不是 id，需要遍历查找
    const { items } = await chrome.storage.local.get('quickURLs');
    if (items) {
      const matched = items.find(item => item.url === sessionState.lastTargetURL);
      if (matched) {
        const idx = sessionState.openedIDs.indexOf(matched.id);
        if (idx !== -1) sessionState.openedIDs.splice(idx, 1);
      }
    }
  }
  sessionState.lastTargetURL = null;
}

chrome.tabs.onCreated.addListener(async (tab) => {
  // 仅处理 Tab Out 的新标签页（chrome-extension://.../index.html 或 chrome://newtab/）
  if (!isTabOutPage(tab.url)) return;

  // 先清理已关闭的 tab（检查上一个 redirect 目标是否仍存在）
  await cleanupClosedTabs();

  // 读取配置
  const { items } = await chrome.storage.local.get('quickURLs');
  if (!items || items.length === 0) return; // 无配置，保持 dashboard

  // 动态计算未完成一轮的 URLs
  const unopened = items.filter(item => !sessionState.openedIDs.includes(item.id));
  if (unopened.length === 0) return; // 所有 URL 都已打开过 → 保持 dashboard

  // redirect 到第一个未打开的 URL
  const target = unopened[0];
  sessionState.openedIDs.push(target.id);
  sessionState.lastTargetURL = target.url;

  await redirectTab(tab.id, target.url);
});
```

- [ ] **Step 4: 验证 background.js 无语法错误**

Run: 检查文件语法（Chrome service worker 不支持直接语法检查，可使用 Read 对照验证逻辑完整性）

- [ ] **Step 5: 提交 Chunk 1**

```bash
git add extension/background.js
git commit -m "feat: add session-based redirect logic in background.js"
```

---

## Chunk 2: index.html — 添加配置区 DOM

**文件:**
- Modify: `extension/index.html:23-29` （在 `</header>` 标签后、`<div class="dashboard-columns">` 前插入配置区）

- [ ] **Step 1: 在 header 闭合标签后添加配置区 HTML**

```html
  </header>

  <!-- ================================================================
       QUICK URLS CONFIG PANEL — collapsible panel at top of dashboard
       ================================================================ -->
  <div class="quicks-urls-panel" id="quicksUrlsPanel">
    <div class="quicks-urls-toggle" id="quicksUrlsToggle">
      <svg class="quicks-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
      </svg>
      <span class="quicks-label">快捷网址</span>
      <span class="quicks-count" id="quicksCount"></span>
      <div class="quicks-toggle-right">
        <button class="quicks-add-tab-btn" id="quicksAddTabBtn" title="从当前 Tab 添加">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          添加当前 Tab
        </button>
        <button class="quicks-expand-btn" id="quicksExpandBtn">展开</button>
      </div>
    </div>
    <div class="quicks-urls-body" id="quicksUrlsBody">
      <div class="quicks-urls-list" id="quicksUrlsList"></div>
      <div class="quicks-urls-empty" id="quicksUrlsEmpty" style="display:none">
        还没有配置网址，试试点击「添加当前 Tab」或下方输入框
      </div>
      <div class="quicks-urls-input-row">
        <input type="url" class="quicks-url-input" id="quicksUrlInput" placeholder="输入网址后按回车添加，如 https://...">
        <button class="quicks-url-add-btn" id="quicksUrlAddBtn">添加</button>
      </div>
    </div>
  </div>

  <!-- ================================================================
       TAB SELECTOR MODAL — popup when adding from current tabs
       ================================================================ -->
  <div class="quicks-tab-modal" id="quicksTabModal" style="display:none">
    <div class="quicks-tab-modal-backdrop" id="quicksTabModalBackdrop"></div>
    <div class="quicks-tab-modal-content">
      <div class="quicks-tab-modal-header">
        <h3>选择要添加的 Tab</h3>
        <button class="quicks-tab-modal-close" id="quicksTabModalClose">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="quicks-tab-modal-search">
        <input type="text" class="quicks-tab-search-input" id="quicksTabSearchInput" placeholder="搜索 Tab 标题或网址...">
      </div>
      <div class="quicks-tab-list" id="quicksTabList"></div>
    </div>
  </div>

  <!-- ================================================================
       MAIN CONTENT AREA
       ================================================================ -->
  <div class="dashboard-columns" id="dashboardColumns">
```

- [ ] **Step 2: 提交 Chunk 2**

```bash
git add extension/index.html
git commit -m "feat: add quick URLs config panel DOM in index.html"
```

---

## Chunk 3: style.css — 配置区样式

**文件:**
- Modify: `extension/style.css`（在文件末尾添加新样式）

- [ ] **Step 1: 添加配置区样式**

```css
/* ================================================================
   QUICK URLS PANEL
   ================================================================ */

.quicks-urls-panel {
  margin-bottom: 24px;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.15s;
}

.quicks-urls-panel:hover {
  border-color: var(--border-hover);
}

/* Toggle row (always visible) */
.quicks-urls-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  background: var(--surface-secondary);
}

.quicks-chevron {
  width: 16px;
  height: 16px;
  color: var(--muted);
  flex-shrink: 0;
  transition: transform 0.2s ease-out;
}

.quicks-urls-panel.expanded .quicks-chevron {
  transform: rotate(180deg);
}

.quicks-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.quicks-count {
  font-family: 'Newsreader', serif;
  font-size: 12px;
  color: var(--muted);
  background: var(--surface-primary);
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  margin-left: 4px;
}

.quicks-toggle-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.quicks-add-tab-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface-primary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.quicks-add-tab-btn:hover {
  border-color: var(--border-hover);
  color: var(--text-primary);
  background: var(--surface-hover);
}

.quicks-add-tab-btn svg {
  width: 14px;
  height: 14px;
}

.quicks-expand-btn {
  font-size: 12px;
  color: var(--muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: color 0.15s;
}

.quicks-expand-btn:hover {
  color: var(--text-primary);
}

/* Collapsible body */
.quicks-urls-body {
  display: none;
  flex-direction: column;
  gap: 0;
  border-top: 1px solid var(--border);
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.2s ease-out;
}

.quicks-urls-panel.expanded .quicks-urls-body {
  display: flex;
  max-height: 600px;
  overflow-y: auto;
}

.quicks-urls-list {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Empty state */
.quicks-urls-empty {
  padding: 20px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}

/* Input row */
.quicks-urls-input-row {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--surface-secondary);
}

.quicks-url-input {
  flex: 1;
  font-size: 13px;
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface-primary);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s;
}

.quicks-url-input:focus {
  border-color: var(--accent);
}

.quicks-url-input::placeholder {
  color: var(--muted);
}

.quicks-url-add-btn {
  font-size: 12px;
  font-weight: 500;
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface-primary);
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.quicks-url-add-btn:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* ================================================================
   QUICK URL CARD
   ================================================================ */

.quicks-url-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  position: relative;
}

.quicks-url-card:hover {
  background: var(--surface-hover);
  border-color: var(--border);
}

.quicks-url-card .drag-handle {
  color: var(--muted);
  cursor: grab;
  font-size: 14px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s;
}

.quicks-url-card:hover .drag-handle {
  opacity: 1;
}

.quicks-url-card .favicon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 3px;
}

.quicks-url-card .url-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.quicks-url-card .url-title {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quicks-url-card .url-hostname {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quicks-url-card .url-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--surface-secondary);
  color: var(--muted);
  border: 1px solid var(--border);
  flex-shrink: 0;
  max-width: 80px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quicks-url-card .url-delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--muted);
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.12s, color 0.12s;
  flex-shrink: 0;
}

.quicks-url-card:hover .url-delete-btn {
  opacity: 1;
}

.quicks-url-card .url-delete-btn:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.quicks-url-card .url-delete-btn svg {
  width: 14px;
  height: 14px;
}

/* ================================================================
   TAB SELECTOR MODAL
   ================================================================ */

.quicks-tab-modal {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.quicks-tab-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
}

.quicks-tab-modal-content {
  position: relative;
  width: 480px;
  max-height: 70vh;
  background: var(--surface-primary);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.quicks-tab-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.quicks-tab-modal-header h3 {
  font-family: 'DM Sans', sans-serif;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.quicks-tab-modal-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--muted);
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  transition: color 0.12s;
}

.quicks-tab-modal-close:hover {
  color: var(--text-primary);
}

.quicks-tab-modal-close svg {
  width: 18px;
  height: 18px;
}

.quicks-tab-modal-search {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.quicks-tab-search-input {
  width: 100%;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface-secondary);
  color: var(--text-primary);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.quicks-tab-search-input:focus {
  border-color: var(--accent);
}

.quicks-tab-list {
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.quicks-tab-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s;
}

.quicks-tab-item:hover {
  background: var(--surface-hover);
}

.quicks-tab-item .tab-favicon {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  flex-shrink: 0;
}

.quicks-tab-item .tab-info {
  flex: 1;
  min-width: 0;
}

.quicks-tab-item .tab-title {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quicks-tab-item .tab-url {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 2: 提交 Chunk 3**

```bash
git add extension/style.css
git commit -m "feat: add quick URLs panel and tab selector modal styles"
```

---

## Chunk 4: app.js — 配置区渲染与交互逻辑

**文件:**
- Modify: `extension/app.js`（在文件末尾添加新逻辑，注意不要影响原有功能）

### 4.1 数据存储函数

- [ ] **Step 1: 在 app.js 末尾（`renderDashboard();` 之前）添加配置相关函数**

```javascript
/* ================================================================
   QUICK URLS — Configuration Panel
   ================================================================ */

// Storage key
const QUICK_URLS_KEY = 'quickURLs';

/**
 * getQuickURLs()
 * 从 chrome.storage.local 读取已配置的 URLs
 */
async function getQuickURLs() {
  const result = await chrome.storage.local.get(QUICK_URLS_KEY);
  return result[QUICK_URLS_KEY] || [];
}

/**
 * saveQuickURLs(items)
 * 保存 URLs 列表到 chrome.storage.local
 * @param {Array} items
 */
async function saveQuickURLs(items) {
  await chrome.storage.local.set({ [QUICK_URLS_KEY]: items });
}

/**
 * generateQuickURLItem(url, title)
 * 根据 URL 和 title 生成一个标准化配置项
 */
function generateQuickURLItem(url, title) {
  let hostname = '';
  try { hostname = new URL(url).hostname; } catch {}
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    url,
    title: title || url,
    hostname,
    favicon: hostname ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=32` : ''
  };
}

/**
 * addQuickURL(url, title)
 * 添加一个 URL 到配置列表（插入到最前面）
 */
async function addQuickURL(url, title) {
  const items = await getQuickURLs();
  // 避免重复 URL
  if (items.some(item => item.url === url)) return false;
  const newItem = generateQuickURLItem(url, title);
  items.unshift(newItem);
  await saveQuickURLs(items);
  return newItem;
}

/**
 * removeQuickURL(id)
 * 从配置列表中删除指定 id 的 URL
 */
async function removeQuickURL(id) {
  const items = await getQuickURLs();
  const filtered = items.filter(item => item.id !== id);
  await saveQuickURLs(filtered);
}

/**
 * reorderQuickURLs(fromIndex, toIndex)
 * 移动 URL 从一个位置到另一个位置
 */
async function reorderQuickURLs(fromIndex, toIndex) {
  const items = await getQuickURLs();
  const [moved] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, moved);
  await saveQuickURLs(items);
}
```

### 4.2 渲染配置面板

- [ ] **Step 2: 添加配置面板渲染函数**

```javascript
/**
 * renderQuickURLsPanel()
 * 渲染快捷网址配置面板（顶部可折叠区）
 * 读取配置，刷新面板状态
 */
async function renderQuickURLsPanel() {
  const panel = document.getElementById('quicksUrlsPanel');
  const toggle = document.getElementById('quicksUrlsToggle');
  const body = document.getElementById('quicksUrlsBody');
  const countEl = document.getElementById('quicksCount');
  const listEl = document.getElementById('quicksUrlsList');
  const emptyEl = document.getElementById('quicksUrlsEmpty');
  const expandBtn = document.getElementById('quicksExpandBtn');

  if (!panel) return;

  const items = await getQuickURLs();

  // 无配置时隐藏整个面板
  if (items.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  countEl.textContent = `(${items.length})`;

  // 渲染 URL 列表
  if (items.length > 0) {
    listEl.innerHTML = items.map(item => renderQuickURLCard(item)).join('');
    listEl.style.display = 'flex';
    emptyEl.style.display = 'none';
  } else {
    listEl.style.display = 'none';
    emptyEl.style.display = 'block';
  }

  // 更新展开/收起按钮文字
  if (expandBtn) {
    expandBtn.textContent = panel.classList.contains('expanded') ? '收起' : '展开';
  }
}

/**
 * renderQuickURLCard(item)
 * 渲染单个 URL 卡片
 */
function renderQuickURLCard(item) {
  const safeUrl = (item.url || '').replace(/"/g, '&quot;');
  const safeTitle = (item.title || '').replace(/"/g, '&quot;');
  return `
    <div class="quicks-url-card" data-id="${item.id}" data-url="${safeUrl}">
      <span class="drag-handle" title="拖动排序">⠿</span>
      <img class="favicon" src="${item.favicon}" alt="" onerror="this.style.display='none'">
      <div class="url-info">
        <div class="url-title">${item.title || item.url}</div>
        <div class="url-hostname">${item.hostname}</div>
      </div>
      <span class="url-badge">${item.hostname}</span>
      <button class="url-delete-btn" data-action="quicks-delete" data-id="${item.id}" title="删除">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>`;
}
```

### 4.3 Tab 选择弹窗

- [ ] **Step 3: 添加 Tab 选择弹窗逻辑**

```javascript
/**
 * openTabSelectorModal()
 * 打开 Tab 选择弹窗，列出所有可添加的 tabs
 */
async function openTabSelectorModal() {
  const modal = document.getElementById('quicksTabModal');
  const listEl = document.getElementById('quicksTabList');
  const searchInput = document.getElementById('quicksTabSearchInput');

  if (!modal) return;

  // 列出所有 tabs（排除 Tab Out 自身和 chrome:// 页面）
  const allTabs = await chrome.tabs.query({});
  const selectableTabs = allTabs.filter(t => {
    const url = t.url || '';
    return !url.startsWith('chrome://') &&
           !url.startsWith('chrome-extension://') &&
           !url.startsWith('about:') &&
           !url.startsWith('file://');
  });

  window._quicksSelectableTabs = selectableTabs;

  function renderTabs(tabs) {
    listEl.innerHTML = tabs.map(tab => {
      let hostname = '';
      try { hostname = new URL(tab.url).hostname; } catch {}
      const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
      return `
        <div class="quicks-tab-item" data-url="${(tab.url || '').replace(/"/g, '&quot;')}" data-title="${(tab.title || '').replace(/"/g, '&quot;')}">
          <img class="tab-favicon" src="${faviconUrl}" alt="" onerror="this.style.display='none'">
          <div class="tab-info">
            <div class="tab-title">${tab.title || tab.url}</div>
            <div class="tab-url">${tab.url}</div>
          </div>
        </div>`;
    }).join('');
  }

  renderTabs(selectableTabs);
  searchInput.value = '';
  modal.style.display = 'flex';

  // 聚焦搜索框
  setTimeout(() => searchInput.focus(), 50);
}

/**
 * closeTabSelectorModal()
 */
function closeTabSelectorModal() {
  const modal = document.getElementById('quicksTabModal');
  if (modal) modal.style.display = 'none';
  window._quicksSelectableTabs = null;
}
```

### 4.4 事件绑定

- [ ] **Step 4: 在 app.js 末尾 `renderDashboard();` 调用之前添加事件绑定**

```javascript
/* ================================================================
   QUICK URLS — Event Bindings
   ================================================================ */

// Panel toggle (expand/collapse)
document.addEventListener('click', async (e) => {
  const toggle = e.target.closest('#quicksUrlsToggle');
  const expandBtn = e.target.closest('#quicksExpandBtn');

  if (toggle || expandBtn) {
    const panel = document.getElementById('quicksUrlsPanel');
    const body = document.getElementById('quicksUrlsBody');
    const expandBtnEl = document.getElementById('quicksExpandBtn');
    panel.classList.toggle('expanded');

    if (panel.classList.contains('expanded')) {
      body.style.maxHeight = '600px';
      if (expandBtnEl) expandBtnEl.textContent = '收起';
    } else {
      body.style.maxHeight = '0';
      if (expandBtnEl) expandBtnEl.textContent = '展开';
    }
    return;
  }

  // "添加当前 Tab" 按钮
  if (e.target.closest('#quicksAddTabBtn')) {
    await openTabSelectorModal();
    return;
  }

  // 关闭弹窗按钮
  if (e.target.closest('#quicksTabModalClose') || e.target.closest('#quicksTabModalBackdrop')) {
    closeTabSelectorModal();
    return;
  }

  // 选择 tab 列表中的某一项
  const tabItem = e.target.closest('.quicks-tab-item');
  if (tabItem && tabItem.dataset.url) {
    await addQuickURL(tabItem.dataset.url, tabItem.dataset.title);
    closeTabSelectorModal();
    await renderQuickURLsPanel();
    return;
  }

  // Tab 搜索过滤
  if (e.target.id === 'quicksTabSearchInput') {
    // 搜索事件由 input 监听器处理
    return;
  }

  // 删除 URL 按钮
  const deleteBtn = e.target.closest('[data-action="quicks-delete"]');
  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    await removeQuickURL(id);
    await renderQuickURLsPanel();
    return;
  }

  // 点击 URL 卡片（跳转到该 URL，新 tab 打开）
  const urlCard = e.target.closest('.quicks-url-card');
  if (urlCard && !e.target.closest('.url-delete-btn') && !e.target.closest('.drag-handle')) {
    const url = urlCard.dataset.url;
    if (url) {
      chrome.tabs.create({ url });
    }
    return;
  }
});

// Tab search input filtering
document.addEventListener('input', (e) => {
  if (e.target.id !== 'quicksTabSearchInput') return;
  const q = e.target.value.trim().toLowerCase();
  const listEl = document.getElementById('quicksTabList');
  const tabs = window._quicksSelectableTabs || [];
  const filtered = tabs.filter(tab =>
    (tab.title || '').toLowerCase().includes(q) ||
    (tab.url || '').toLowerCase().includes(q)
  );
  listEl.innerHTML = filtered.map(tab => {
    let hostname = '';
    try { hostname = new URL(tab.url).hostname; } catch {}
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
    return `
      <div class="quicks-tab-item" data-url="${(tab.url || '').replace(/"/g, '&quot;')}" data-title="${(tab.title || '').replace(/"/g, '&quot;')}">
        <img class="tab-favicon" src="${faviconUrl}" alt="" onerror="this.style.display='none'">
        <div class="tab-info">
          <div class="tab-title">${tab.title || tab.url}</div>
          <div class="tab-url">${tab.url}</div>
        </div>
      </div>`;
  }).join('');
});

// URL input — enter key to add
document.addEventListener('keydown', async (e) => {
  if (e.target.id !== 'quicksUrlInput') return;
  if (e.key !== 'Enter') return;
  const input = e.target;
  const url = input.value.trim();
  if (!url) return;
  try { new URL(url); } catch {
    showToast('请输入有效的网址');
    return;
  }
  await addQuickURL(url, url);
  input.value = '';
  await renderQuickURLsPanel();
});

// "添加" 按钮点击
document.addEventListener('click', async (e) => {
  if (!e.target.closest('#quicksUrlAddBtn')) return;
  const input = document.getElementById('quicksUrlInput');
  const url = (input?.value || '').trim();
  if (!url) return;
  try { new URL(url); } catch {
    showToast('请输入有效的网址');
    return;
  }
  await addQuickURL(url, url);
  if (input) input.value = '';
  await renderQuickURLsPanel();
});

// Drag-to-reorder for URL cards
let dragSrcIndex = null;

document.addEventListener('mousedown', (e) => {
  const handle = e.target.closest('.drag-handle');
  if (!handle) return;
  const card = handle.closest('.quicks-url-card');
  if (!card) return;
  const cards = Array.from(document.querySelectorAll('.quicks-url-card'));
  dragSrcIndex = cards.indexOf(card);
});

document.addEventListener('mouseup', async (e) => {
  if (dragSrcIndex === null) return;
  const card = e.target.closest('.quicks-url-card');
  if (!card) {
    dragSrcIndex = null;
    return;
  }
  const cards = Array.from(document.querySelectorAll('.quicks-url-card'));
  const dragDstIndex = cards.indexOf(card);
  if (dragDstIndex !== dragSrcIndex && dragDstIndex !== -1) {
    await reorderQuickURLs(dragSrcIndex, dragDstIndex);
    await renderQuickURLsPanel();
  }
  dragSrcIndex = null;
});
```

### 4.5 初始化调用

- [ ] **Step 5: 修改 `renderDashboard()` 函数末尾，在 `renderDeferredColumn()` 后调用 `renderQuickURLsPanel()`**

在 `renderStaticDashboard()` 函数末尾（约 `await renderDeferredColumn();` 之后）添加：

```javascript
  // --- Render Quick URLs config panel ---
  await renderQuickURLsPanel();
```

- [ ] **Step 6: 提交 Chunk 4**

```bash
git add extension/app.js
git commit -m "feat: add quick URLs config panel rendering and interactions"
```

---

## Chunk 5: manifest.json — 权限补充

**文件:**
- Modify: `extension/manifest.json`

- [ ] **Step 1: 添加 `scripting` 权限（background.js inject script 需要）**

```json
"permissions": ["tabs", "activeTab", "storage", "scripting"],
```

- [ ] **Step 2: 提交 Chunk 5**

```bash
git add extension/manifest.json
git commit -m "feat: add scripting permission for redirect injection"
```

---

## 集成验证

- [ ] **Step 1: 加载扩展**
  1. Chrome → `chrome://extensions`
  2. 开发者模式开启
  3. 点击「加载已解压的扩展程序」
  4. 选择 `extension/` 文件夹

- [ ] **Step 2: 基本功能测试**
  1. 打开新标签页 → 应显示 Tab Out 仪表盘（配置区应隐藏，因为无配置）
  2. 点击「添加当前 Tab」→ 应弹出 tab 选择框
  3. 选择一个 tab → 应添加到配置区
  4. 再次打开新标签页 → **此时应 redirect 到刚配置的 URL**（因为有配置且该 URL 未打开过）
  5. 关闭该 URL tab，再次打开新标签页 → **该 URL 应重新参与循环**（回到仪表盘或下一个 URL）

- [ ] **Step 3: 多 URL 循环测试**
  1. 配置 A、B、C 三个 URL
  2. 新标签页 #1 → A
  3. 新标签页 #2 → B
  4. 新标签页 #3 → C
  5. 新标签页 #4 → 仪表盘（A/B/C 都已打开过）
  6. 新标签页 #5 → A（重新开始循环）

- [ ] **Step 4: 验证配置区样式**
  1. 配置区展开/收起动画是否平滑
  2. 删除按钮 hover 时是否正常显示
  3. 拖拽排序是否工作
