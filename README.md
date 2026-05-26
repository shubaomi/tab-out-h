# Tab Out

**Keep tabs on your tabs.**

Tab Out is a Chrome extension that replaces your new tab page with a clean dashboard of everything you have open. Tabs are grouped by domain, with homepages like Gmail, X, LinkedIn, YouTube, and GitHub pulled into their own cleanup group.

No server. No account. No build step. No automatic external resource requests.

---

## Install with a coding agent

Send your coding agent (Claude Code, Codex, etc.) this repo and say **"install this"**:

```text
https://github.com/shubaomi/tab-out-h
```

The agent will walk you through loading the extension in Chrome. Setup takes about 1 minute.

> Extended by [shubaomi](https://github.com/shubaomi), based on [tab-out](https://github.com/zarazhangrui/tab-out) by [Zara](https://x.com/zarazhangrui).

---

## Features

- **See all your tabs at a glance** on a clean grid grouped by domain
- **Homepages group** collects Gmail inbox, X home, YouTube, LinkedIn, GitHub, and similar landing pages into one card
- **Close tabs with style** using a synthesized swoosh sound and confetti burst
- **Duplicate detection** flags duplicate pages and lets you close extras while keeping one copy
- **Click any tab title to jump to it** even across different Chrome windows
- **Save for later** stores individual tabs in a local checklist before closing them
- **Localhost grouping** shows port numbers so local projects are easy to tell apart
- **Expandable groups** show the first 8 tabs with a clickable "+N more"
- **Quick URLs** lets you maintain a local ordered list of URLs; after the dashboard is already open, new tabs can redirect to the first configured URL that is not currently open
- **Drag-to-reorder Quick URLs** directly in the dashboard
- **Real favicons without third-party favicon lookup** using Chrome's tab metadata when available, with local letter placeholders as a fallback
- **100% local data** saved tabs and Quick URLs are stored in `chrome.storage.local`
- **Pure Chrome extension** no server, no Node.js, no npm

---

## Manual setup

**1. Clone the repo**

```bash
git clone https://github.com/shubaomi/tab-out-h.git
cd tab-out-h
```

**2. Load the Chrome extension**

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** in the top-right corner
3. Click **Load unpacked**
4. Select the `extension/` folder inside this repo

**3. Open a new tab**

You should see Tab Out.

---

## How it works

```text
You open a new tab
  -> If no Tab Out dashboard is open yet, Chrome shows the dashboard
  -> If the dashboard is already open and Quick URLs are configured,
     Tab Out redirects the new tab to the first configured URL that is not open
  -> The dashboard shows open tabs grouped by domain
  -> Homepage tabs are grouped near the top
  -> Click a tab title to focus it
  -> Close individual tabs, duplicate tabs, or whole groups
  -> Save individual tabs for later before closing them
```

Everything runs inside the Chrome extension. Saved tabs and Quick URLs stay in `chrome.storage.local`.

---

## Privacy and permissions

Tab Out does not run a server and does not send your tab list to an external service.

The extension requests only:

| Permission | Why |
| --- | --- |
| `tabs` | Read, focus, create, and close tabs |
| `storage` | Save "Saved for later" items and Quick URLs locally |

Favicons are read from Chrome's tab metadata when Chrome already has them. If no favicon is available, Tab Out shows a local letter placeholder instead of calling a third-party favicon service.

---

## Tech stack

| What | How |
| --- | --- |
| Extension | Chrome Manifest V3 |
| Storage | `chrome.storage.local` |
| Sound | Web Audio API, synthesized locally |
| Animations | CSS transitions and JS confetti particles |
| UI | Plain HTML, CSS, and JavaScript |

---

## Updating

```bash
git pull
```

Then open `chrome://extensions` and click reload on Tab Out.

---

## License

MIT

---

Extended by [shubaomi](https://github.com/shubaomi). Based on [Zara](https://x.com/zarazhangrui)'s [tab-out](https://github.com/zarazhangrui/tab-out).
