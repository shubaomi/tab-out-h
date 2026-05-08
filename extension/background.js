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
// NEW TAB INTERCEPTOR
// No session state — always check current real open tabs
// ================================================================

/**
 * redirectTab(tabId, targetURL)
 * 直接用 chrome.tabs.update 跳转到目标 URL
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

  // Tab Out overrides chrome://newtab/ — check if dashboard is already open
  const dashboardOpen = [...openUrls].some(url => url === 'chrome://newtab');

  // If dashboard is not yet open, let this new tab show the dashboard
  if (!dashboardOpen) return;

  // Dashboard is open — redirect to quick URLs as before
  const stored = await chrome.storage.local.get('quickURLs');
  const items = stored.quickURLs;
  if (!items || items.length === 0) return;

  const target = items.find(item => !openUrls.has(normalizeUrl(item.url)));
  if (!target) return;

  try {
    await chrome.tabs.update(tab.id, { url: target.url });
  } catch (err) {
    console.error('[tab-out] redirect FAILED:', err);
  }
});
