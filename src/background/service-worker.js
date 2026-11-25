importScripts('../shared/defaults.js', '../shared/storage.js');

(function () {
  'use strict';

  var YTB = globalThis.YTB;
  var YOUTUBE_TAB_URLS = ['https://www.youtube.com/*', 'https://m.youtube.com/*'];
  var CONTENT_CSS_FILES = ['src/content/content.css'];
  var CONTENT_JS_FILES = [
    'src/shared/defaults.js',
    'src/shared/storage.js',
    'src/content/selectors.js',
    'src/content/dom-observer.js',
    'src/content/main.js'
  ];

  // Serialize sidebar discovery writes across concurrent YouTube tabs.
  var sidebarMergeChain = Promise.resolve();

  function isSupportedYouTubeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return (
      url.indexOf('/embed/') === -1 &&
      url.indexOf('/live_chat') === -1
    );
  }

  async function queryAllYouTubeTabs() {
    if (!chrome.tabs || typeof chrome.tabs.query !== 'function') return [];
    try {
      var tabs = await chrome.tabs.query({ url: YOUTUBE_TAB_URLS });
      return (tabs || []).filter(function (tab) {
        return tab && typeof tab.id === 'number' && isSupportedYouTubeUrl(tab.url);
      });
    } catch (_) {
      return [];
    }
  }

  function sendTabMessageSafe(tabId, message) {
    return new Promise(function (resolve) {
      try {
        chrome.tabs.sendMessage(tabId, message, function (response) {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(response || null);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function syncActionBadge(settings) {
    if (!chrome.action) return;
    try {
      var activeSettings = settings || await YTB.storage.getSettings();
      if (activeSettings.masterEnabled) {
        await chrome.action.setBadgeText({ text: '' });
      } else {
        await chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
        await chrome.action.setBadgeText({ text: 'OFF' });
      }
    } catch (_) {
      // Ignore transient action errors when no browser window is focused.
    }
  }

  async function injectTabIfNeeded(tabId) {
    var existing = await sendTabMessageSafe(tabId, { type: 'YTB_PING_TAB', rescan: false });
    if (existing && existing.ok) return true;
    if (!chrome.scripting) return false;
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: CONTENT_CSS_FILES
      });
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: CONTENT_JS_FILES
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  async function injectIntoExistingYouTubeTabs() {
    var tabs = await queryAllYouTubeTabs();
    await Promise.all(tabs.map(function (tab) {
      return injectTabIfNeeded(tab.id);
    }));
  }

  async function broadcastSettingsToYouTubeTabs(settings) {
    var tabs = await queryAllYouTubeTabs();
    await Promise.all(tabs.map(async function (tab) {
      var res = await sendTabMessageSafe(tab.id, {
        type: 'YTB_APPLY_SETTINGS',
        settings: settings
      });
      // If a tab had not yet received the content script (e.g. pre-existing tab), inject it now.
      if (!res) {
        await injectTabIfNeeded(tab.id);
      }
    }));
  }

  async function scanAllYouTubeTabs(rescan) {
    var tabs = await queryAllYouTubeTabs();
    var results = await Promise.all(tabs.map(async function (tab) {
      var res = await sendTabMessageSafe(tab.id, {
        type: 'YTB_PING_TAB',
        rescan: Boolean(rescan)
      });
      if (!res) {
        var injected = await injectTabIfNeeded(tab.id);
        if (injected) {
          res = await sendTabMessageSafe(tab.id, {
            type: 'YTB_PING_TAB',
            rescan: Boolean(rescan)
          });
        }
      }
      return res;
    }));

    var connected = results.filter(function (r) { return Boolean(r && r.ok); });
    return {
      ok: true,
      tabCount: connected.length,
      routes: connected.map(function (r) { return r.route; })
    };
  }

  chrome.runtime.onInstalled.addListener(async function () {
    try {
      var existing = await YTB.storage.getSettings();
      await YTB.storage.saveSettings(existing);
      await syncActionBadge(existing);
      await injectIntoExistingYouTubeTabs();
    } catch (_) {
      // Ignore storage initialization failures in restricted contexts.
    }
  });

  chrome.runtime.onStartup.addListener(async function () {
    await syncActionBadge();
    await injectIntoExistingYouTubeTabs();
  });

  chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName !== 'local') return;
    var key = YTB.STORAGE_KEYS.SETTINGS;
    if (changes && changes[key]) {
      var normalized = YTB.normalizeSettings(changes[key].newValue);
      syncActionBadge(normalized);
      broadcastSettingsToYouTubeTabs(normalized);
    }
  });

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (!message || typeof message.type !== 'string') return;

    if (message.type === 'YTB_MERGE_SIDEBAR' && Array.isArray(message.items)) {
      sidebarMergeChain = sidebarMergeChain.then(function () {
        return YTB.storage.mergeDiscoveredSidebarItems(message.items);
      }).catch(function () {
        return [];
      });
      sidebarMergeChain.then(function () {
        sendResponse({ ok: true });
      });
      return true;
    }

    if (message.type === 'YTB_SCAN_ALL_TABS') {
      scanAllYouTubeTabs(Boolean(message.rescan)).then(function (summary) {
        sendResponse(summary);
      }).catch(function () {
        sendResponse({ ok: false, tabCount: 0, routes: [] });
      });
      return true;
    }
  });
})();
