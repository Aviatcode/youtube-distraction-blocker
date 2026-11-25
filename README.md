# YouTube Distraction Blocker (Manifest V3)

A lightweight, privacy-first, plain JavaScript/HTML/CSS Chrome & Chromium extension that removes addictive YouTube discovery distractions while keeping video playback, search, subscriptions, comments, and core navigation intact.

---

## Key Features

1. **Infinite Scroll Blocker (Feed)**  
   Stops automatic endless feed loading on YouTube Home, Subscriptions, Channel grids, Search, and Watch Next recommendations—while keeping comments, playlists, normal navigation, and manual search working (including an explicit **Load more search results** button on Search).
2. **Shorts Controls (3 Independent Options)**  
   - **Hide Shorts on homepage** (ON by default): Removes Shorts shelves, grids, and Shorts cards from the YouTube homepage without touching long-form videos.
   - **Hide Shorts tab in sidebar** (ON by default): Hides the Shorts button/tab in the left expanded sidebar, collapsed mini-guide, channel tabs, and mobile navigation bar.
   - **Hide Shorts in subscriptions** (OFF by default): Keeps Shorts from subscribed channels visible in Subscriptions unless you explicitly turn it ON.
4. **Trending Blocker (Content Restrictions)**  
   Hides Trending/Explore Trending sidebar links, Trending feed shelves, and Trending pages (showing a non-intrusive notice if visited directly).
5. **YouTube Premium Promo Blocker (Content Restrictions)**  
   Hides YouTube Premium sidebar links, promotional banners, upsell mealbars/dialogs (with safe overlay dismissal so pages never freeze), and Premium-badged promo shelves—never hiding normal creator videos whose titles merely contain "Premium".
6. **Members-Only Blocker (Content Restrictions)**  
   Hides videos, community posts, and shelves explicitly marked **Members-only** / **Join-exclusive** via badge/renderer metadata—never hiding ordinary public videos from channels that offer memberships.
7. **YouTube Playables Blocker (Content Restrictions)**  
   Hides Playables mini-games, homepage Playables shelves, Playables filter chips, sidebar navigation links, and Playables pages without blocking normal gaming videos.
8. **Auto Theater Mode (Player)**  
   Optionally switches video watch pages to YouTube Theater mode automatically (OFF by default), without interfering if you manually toggle back to Default view on the current video or enter Fullscreen.
9. **Dynamic Sidebar Customization (Sidebar)**  
   Provides individual ON/OFF hiding switches for Kids, Movies & TV, News, Sports, Gaming, Music, Podcasts, Live, Shopping, Courses/Learning, Fashion & Beauty, YouTube Music, YouTube Studio, and any additional navigation items dynamically detected on your specific YouTube account (while leaving subscribed creator channels untouched).
10. **Independent Persistence & Master Switch**  
   Every toggle is independent, stored locally in `chrome.storage.local`, survives browser restarts, and updates open YouTube tabs immediately without refreshing. The **Master** switch pauses all filtering at once without losing individual preferences, and **Restore Defaults** resets configuration cleanly.

---

## Architecture & File Responsibilities

```text
Youtubeblocker/
├── manifest.json                   # MV3 manifest: "storage" + "scripting" permissions, YouTube-only host scope at document_start
├── assets/icons/                   # Extension PNG icons (16, 32, 48, 128)
├── src/
│   ├── shared/
│   │   ├── defaults.js             # Default settings schema, feature metadata, canonical sidebar catalog & normalizer
│   │   ├── storage.js              # Isolated chrome.storage.local wrapper (settings vs discovered sidebar keys)
│   │   ├── dashboard-ui.js         # Shared UI controller for popup & options (switches, multi-tab scan, Restore Defaults)
│   │   └── ui.css                  # Shared adaptive light/dark UI styling
│   ├── background/
│   │   └── service-worker.js       # Event-driven MV3 worker: injects into existing YouTube tabs, broadcasts settings across all tabs, serializes sidebar merges, updates "OFF" badge
│   ├── content/
│   │   ├── content.css             # Zero-JS attribute & :has() CSS hiding rules + light/dark YouTube theme UI styles
│   │   ├── selectors.js            # Centralized YouTube DOM selectors, badge/promo/Shorts classifiers, sidebar extractor
│   │   ├── dom-observer.js         # RAF-batched MutationObserver, SPA navigation handling, safe recycling re-evaluation
│   │   └── main.js                 # Entry point at document_start, live storage.onChanged listener, popup status responder
│   ├── popup/
│   │   ├── popup.html              # Compact popup dashboard
│   │   ├── popup.css               # Popup sizing & layout styles
│   │   └── popup.js                # Popup entry point
│   └── options/
│       ├── options.html            # Full-page settings view (accessible via popup gear button or Extensions -> Options)
│       ├── options.css             # Responsive centered page layout
│       └── options.js              # Options page entry point
└── tests/
    ├── dom-mock.js                 # Lightweight deterministic DOM & MutationObserver test double
    └── run-tests.js                # Automated unit & DOM integration test suite (Node.js, zero dependencies)
```

### Performance & Safety Design Choices

- **Zero network/API interception:** Never hooks `fetch`, `XMLHttpRequest`, or video streams; zero telemetry or external requests.
- **YouTube-only injection:** Content scripts only load on `https://www.youtube.com/*` and `https://m.youtube.com/*` (explicitly excluding `/embed/*`, `/live_chat*`, and `/live_chat_replay*`).
- **CSS-first + `document_start`:** Structural rules and `html[data-ytb-*]` flags prevent flash-of-distractions and toggle in `O(1)` without scanning the DOM when switching settings.
- **Incremental batched `MutationObserver`:** Ignores high-frequency mutations inside `#movie_player`, `ytd-player`, `#comments`, and `#chat`, and batches candidate node checks once per animation frame (`requestAnimationFrame`).
- **Recycling-safe classifiers:** Polymer DOM reuse clears stale attributes when an element changes from restricted to public content.
- **Separate storage keys:** User settings (`ytbSettings`) and dynamically discovered sidebar items (`ytbDiscoveredSidebar`) live under distinct keys to avoid write contention.

---

## Installation Instructions (Load Unpacked)

This extension works identically on **Google Chrome** and Chromium-based browsers (Edge, Brave, Vivaldi, Opera) across **Windows**, **Linux**, and **macOS**.

### Windows
1. Download or place this `Youtubeblocker` folder in a permanent location (for example, `C:\Users\<YourName>\Extensions\Youtubeblocker`).
2. Open Google Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked**.
5. Select the `Youtubeblocker` folder (the folder containing `manifest.json`).
6. Pin **YouTube Distraction Blocker** from the Chrome puzzle-piece Extensions menu for quick access.

### Linux
1. Place this `Youtubeblocker` folder in a permanent directory (for example, `~/extensions/Youtubeblocker`).
2. Open Chrome/Chromium and enter `chrome://extensions` in the address bar.
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked**, browse to `~/extensions/Youtubeblocker`, and click **Select** / **Open**.
5. Optionally click the Extensions toolbar icon and pin **YouTube Distraction Blocker**.

### macOS
1. Place this `Youtubeblocker` folder in a permanent folder (for example, `~/Applications/Youtubeblocker` or `~/Extensions/Youtubeblocker`).
2. Open Google Chrome and visit `chrome://extensions`.
3. Toggle **Developer mode** ON in the top-right corner.
4. Click **Load unpacked**, navigate to the `Youtubeblocker` directory, and click **Select**.
5. Pin **YouTube Distraction Blocker** to the Chrome toolbar if desired.

> **Important:** Do not delete or move the `Youtubeblocker` folder after loading it unpacked, or Chrome will disable the extension until reloaded from the new path.

---

## Testing Instructions

### 1. Automated Verification Suite (Node.js)
Run the automated JS syntax check and unit/DOM integration suite from the repository root:

```bash
node tests/run-tests.js
```

On Windows PowerShell (to check every JS file syntax and run tests):

```powershell
Get-ChildItem -Recurse -Filter *.js src,tests | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { exit 1 } }; node tests\run-tests.js
```

The automated suite verifies:
- Manifest V3 validity, minimal permissions (`storage` only), YouTube-only scope, and referenced assets
- CSS brace integrity across all stylesheets
- Settings schema defaults, normalization, independent toggles, Master switch state preservation, and Restore Defaults
- Dynamic sidebar canonical resolution and non-redundant storage merging
- DOM classification & recycling behavior for Shorts, Trending, Premium promos, Members-only badges/posts, Search manual pagination, playlist continuation preservation, and ignored video player / comments subtrees

### 2. Manual Browser Acceptance Checklist

Open `https://www.youtube.com/` after loading the unpacked extension and verify each item:

- [ ] **Infinite Scroll Blocker (Home & Search):** Scroll to the bottom of Home (`/`). Verify endless video batches do **not** auto-load and the subtle *"Infinite scroll paused — end of loaded feed"* caption appears. Then search for a query (`/results?search_query=documentary`), scroll down, verify results stop auto-loading, and click **Load more search results** to confirm manual pagination loads the next batch cleanly. Open a video's comments section and a long playlist to confirm comments and playlists still load normally.
- [ ] **Shorts Tab Blocker:** Confirm the **Shorts** entry disappears from the expanded left sidebar, collapsed mini-guide, and any channel's navigation tabs. Toggle **Hide Shorts tab in sidebar** OFF in the popup and verify Shorts navigation reappears immediately without reloading.
- [ ] **Homepage & Subscriptions Shorts:** On YouTube Home, confirm Shorts shelves and Shorts video cards are removed while normal long-form video cards remain intact. Open **Subscriptions** (`/feed/subscriptions`) and confirm subscribed creators' Shorts remain visible by default; toggle **Hide Shorts in subscriptions** ON to verify they hide, and back OFF to restore them immediately.
- [ ] **Trending Blocker:** Confirm **Trending** disappears from the sidebar Explore section (while Music, Gaming, Sports, etc. remain unaffected). Navigate directly to `https://www.youtube.com/feed/trending` and confirm Trending videos are hidden and the clean notice banner appears.
- [ ] **Premium Content Blocker:** Confirm **YouTube Premium** disappears from the left sidebar, and any Premium homepage banners/mealbars/upsell dialogs are hidden without freezing page clicks. Search for `"premium review"` and confirm normal creator videos mentioning "Premium" in their title are **not** blocked.
- [ ] **Members-Only Blocker:** Visit a channel that posts Members-only videos or community posts. Confirm items carrying a **Members only** badge are hidden, while the same channel's ordinary public videos remain visible.
- [ ] **YouTube Playables Blocker:** Confirm **Playables** disappears from the sidebar Explore section and Playables game shelves/cards disappear from Home (and `/playables` shows the blocked notice), while ordinary gaming videos remain visible.
- [ ] **Auto Theater Mode (Player):** Toggle **Auto theater mode** ON in the popup, open any video (`/watch?v=...`), and confirm it switches to Theater mode automatically; press `t` to exit Theater mode on that video and confirm it stays in Default view until navigating to the next video.
- [ ] **Sidebar Customization (Dynamic Detection):** Open the left sidebar on YouTube, then open the extension popup (click **Scan** if needed). Toggle **Kids**, **Movies & TV**, **News**, **Sports**, **Gaming**, **Music**, **Podcasts**, **Live**, **Shopping**, or any account-specific item ON/OFF and verify each hides/shows independently—and subscribed creator channels remain visible.
- [ ] **Master Switch, Multi-Tab Sync & Persistence:** Open 2–3 YouTube tabs across Chrome windows, toggle features or flip the **Master** switch OFF/ON in the popup, and confirm every open YouTube tab updates immediately without reloading (and backgrounded tabs stay synced when switched into focus). Restart Chrome and verify all settings persist.
- [ ] **Restore Defaults:** Click **Restore Defaults** in the popup footer and confirm defaults return (`Master: ON`, core blockers `ON`, `Hide Shorts in subscriptions: OFF`, sidebar items `Visible`).
- [ ] **Playback & Theme Integrity:** Play a video in both YouTube Light Theme and Dark Theme, switch quality/captions/fullscreen, and verify zero lag, stutter, or UI glitches.

---

## How to Update When YouTube Changes Its DOM

YouTube periodically updates Polymer tag names, ViewModel wrappers, or badge markup. All DOM targeting is isolated into three files so updates are quick and localized:

1. **Inspect the changed element on YouTube**  
   Right-click the distraction element in Chrome → **Inspect**, and note its outer container tag (e.g. `ytd-rich-item-renderer`, `yt-lockup-view-model`, `grid-shelf-view-model`), child link `href`, badge element/class, or `aria-label`.
2. **Update CSS-first rules in `src/content/content.css`**  
   Add or adjust the selector under the corresponding numbered feature section (`html[data-ytb-enabled="true"][data-ytb-...="true"] ...`). Keep `:has(...)` anchored on specific card/shelf tags rather than broad containers like `div` or `*`.
3. **Update JS fallback classifiers in `src/content/selectors.js`**  
   - Add new card/shelf/promo custom element tag names to `SELECTORS.VIDEO_CARD`, `SELECTORS.SHELF`, `SELECTORS.PROMO`, or `SELECTORS.BADGE_NODES`.
   - Update badge or promo text arrays (`MEMBERS_BADGE_EXACT`, `PREMIUM_BADGE_EXACT`, `SHORTS_TAB_LABELS`) if YouTube changes badge wording.
   - Never match video titles (`#video-title`), descriptions, or channel names—only inspect dedicated badge containers, links, or shelf wrappers.
4. **Update canonical sidebar rules (if YouTube adds new Explore categories)**  
   Add new URL patterns or channel IDs to `SIDEBAR_CATALOG` in `src/shared/defaults.js` (unknown items still auto-discover dynamically via `resolveSidebarEntry` even before updating the catalog).
5. **Add regression coverage & re-test**  
   Add a sample mock DOM element in `tests/run-tests.js`, run `node tests/run-tests.js`, and reload the unpacked extension in `chrome://extensions` (click the refresh icon on the extension card).
