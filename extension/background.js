/**
 * background.js — Service Worker for Badge Updates
 *
 * Chrome's "always-on" background script for Tab Out.
 * Its only job: keep the toolbar badge showing the current open tab count.
 *
 * Since we no longer have a server, we query chrome.tabs directly.
 * The badge counts real web tabs (skipping chrome:// and extension pages).
 *
 * Color coding gives a quick at-a-glance health signal:
 *   Green  (#3d7a4a) → 1–10 tabs  (focused, manageable)
 *   Amber  (#b8892e) → 11–20 tabs (getting busy)
 *   Red    (#b35a5a) → 21+ tabs   (time to cull!)
 */

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

/**
 * redirectTab(tabId, targetURL)
 * 直接用 chrome.tabs.update 跳转到目标 URL（比 executeScript 更早生效）
 */
async function redirectTab(tabId, targetURL) {
  try {
    await chrome.tabs.update(tabId, { url: targetURL });
  } catch (err) {
    console.error('[tab-out] redirect failed:', err);
  }
}

// ─── Badge updater ────────────────────────────────────────────────────────────

/**
 * updateBadge()
 *
 * Counts open real-web tabs and updates the extension's toolbar badge.
 * "Real" tabs = not chrome://, not extension pages, not about:blank.
 */
async function updateBadge() {
  try {
    const tabs = await chrome.tabs.query({});

    // Only count actual web pages — skip browser internals and extension pages
    const count = tabs.filter(t => {
      const url = t.url || '';
      return (
        !url.startsWith('chrome://') &&
        !url.startsWith('chrome-extension://') &&
        !url.startsWith('about:') &&
        !url.startsWith('edge://') &&
        !url.startsWith('brave://')
      );
    }).length;

    // Don't show "0" — an empty badge is cleaner
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });

    if (count === 0) return;

    // Pick badge color based on workload level
    let color;
    if (count <= 10) {
      color = '#3d7a4a'; // Green — you're in control
    } else if (count <= 20) {
      color = '#b8892e'; // Amber — things are piling up
    } else {
      color = '#b35a5a'; // Red — time to focus and close some tabs
    }

    await chrome.action.setBadgeBackgroundColor({ color });

  } catch {
    // If something goes wrong, clear the badge rather than show stale data
    chrome.action.setBadgeText({ text: '' });
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────

// Update badge when the extension is first installed
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

// Update badge when Chrome starts up
chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

// Update badge whenever a tab is opened
chrome.tabs.onCreated.addListener(() => {
  updateBadge();
});

// Update badge whenever a tab is closed
chrome.tabs.onRemoved.addListener(() => {
  updateBadge();
});

// Update badge when a tab's URL changes (e.g. navigating to/from chrome://)
chrome.tabs.onUpdated.addListener(() => {
  updateBadge();
});

// ─── Initial run ─────────────────────────────────────────────────────────────

// Run once immediately when the service worker first loads
updateBadge();

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

// Track tab IDs of new tab pages (set to chrome-extension://.../index.html)
// We store IDs when onCreated fires with empty URL, then check on onUpdated
let pendingTabIds = new Set();

chrome.tabs.onCreated.addListener((tab) => {
  // New tab opened — url may be empty at this point (Chrome hasn't loaded URL yet)
  // Store the tab.id so we can recognize it when onUpdated fires with the actual URL
  pendingTabIds.add(tab.id);
  console.log('[tab-out] onCreated, tab.id:', tab.id, 'pending count:', pendingTabIds.size);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only process when the URL is actually set/changed
  if (changeInfo.url !== undefined) {
    console.log('[tab-out] onUpdated, tabId:', tabId, 'changeInfo.url:', changeInfo.url);
  }
  if (changeInfo.status !== 'complete') return;
  if (!pendingTabIds.has(tabId)) return;

  const url = tab.url || '';
  console.log('[tab-out] onUpdated complete, tabId:', tabId, 'url:', url);

  // Check if this is Tab Out's new tab page
  if (!isTabOutPage(url)) {
    console.log('[tab-out] not a tab-out URL, removing from pending');
    pendingTabIds.delete(tabId);
    return;
  }

  // This is a Tab Out new tab page
  pendingTabIds.delete(tabId);

  // 先清理已关闭的 tab（检查上一个 redirect 目标是否仍存在）
  await cleanupClosedTabs();

  // 读取配置
  const { items } = await chrome.storage.local.get('quickURLs');
  console.log('[tab-out] quickURLs items:', items);
  if (!items || items.length === 0) {
    console.log('[tab-out] no items or empty, returning — show dashboard');
    return; // 无配置，保持 dashboard
  }

  // 动态计算未完成一轮的 URLs
  const unopened = items.filter(item => !sessionState.openedIDs.includes(item.id));
  console.log('[tab-out] unopened URLs:', unopened, 'openedIDs:', sessionState.openedIDs);
  if (unopened.length === 0) {
    console.log('[tab-out] all URLs opened, returning — show dashboard');
    return; // 所有 URL 都已打开过 → 保持 dashboard
  }

  // redirect 到第一个未打开的 URL
  const target = unopened[0];
  sessionState.openedIDs.push(target.id);
  sessionState.lastTargetURL = target.url;
  console.log('[tab-out] redirecting to:', target.url, 'tabId:', tabId);

  await redirectTab(tabId, target.url);
});
