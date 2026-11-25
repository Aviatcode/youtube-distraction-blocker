(function () {
  'use strict';

  var YTB = globalThis.YTB;
  if (!YTB || typeof YTB.createController !== 'function') return;

  // Prevent double initialization within the same extension isolated world.
  if (globalThis.__ytbContentInitialized) return;
  globalThis.__ytbContentInitialized = true;

  function isRuntimeAlive() {
    return typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.runtime.id);
  }

  var controller = YTB.createController({
    document: document,
    window: window,
    onSidebarDiscovered: function (items) {
      if (!isRuntimeAlive()) return;
      if (chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
        try {
          chrome.runtime.sendMessage({ type: 'YTB_MERGE_SIDEBAR', items: items }, function () {
            if (chrome.runtime && chrome.runtime.lastError) {
              YTB.storage.mergeDiscoveredSidebarItems(items).catch(function () {});
            }
          });
          return;
        } catch (_) {
          // Fall back to direct storage merge if background message fails.
        }
      }
      YTB.storage.mergeDiscoveredSidebarItems(items).catch(function () {});
    }
  });

  function syncFromStorage(forceScan) {
    if (!isRuntimeAlive()) {
      controller.pause();
      return;
    }
    YTB.storage.getSettings().then(function (storedSettings) {
      controller.applySettings(storedSettings);
      if (forceScan && document.body) {
        controller.scanVisibleCandidates();
      }
    }).catch(function () {
      // Keep safe defaults if storage is temporarily unavailable.
    });
  }

  // Apply defaults immediately at document_start, then hydrate stored user settings (~1ms).
  controller.init(YTB.createDefaultSettings());
  syncFromStorage(false);

  // Live instant updates from popup/options across all open tabs without requiring refresh.
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== 'local') return;
      var key = YTB.STORAGE_KEYS.SETTINGS;
      if (changes && changes[key]) {
        controller.applySettings(changes[key].newValue);
      }
    });
  }

  // Re-sync when switching back to a backgrounded/throttled tab so multi-tab state never drifts.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      syncFromStorage(true);
    }
  }, { passive: true });

  // Handle YouTube SPA navigation events seamlessly.
  window.addEventListener('yt-navigate-finish', function () {
    controller.handleNavigation();
  }, { passive: true });

  window.addEventListener('yt-page-data-updated', function () {
    controller.handleNavigation();
  }, { passive: true });

  window.addEventListener('popstate', function () {
    controller.handleNavigation();
  }, { passive: true });

  // Pause safely for bfcache navigation, or destroy on true unload.
  window.addEventListener('pagehide', function (event) {
    if (event && event.persisted) {
      controller.pause();
    } else {
      controller.destroy();
    }
  });

  window.addEventListener('pageshow', function (event) {
    if (event && event.persisted) {
      controller.resume();
      syncFromStorage(true);
    }
  });

  // Respond to multi-tab background broadcasts, popup status checks, and sidebar scans.
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'YTB_APPLY_SETTINGS') {
        controller.applySettings(message.settings);
        sendResponse({ ok: true });
        return;
      }
      if (message.type === 'YTB_PING_TAB') {
        if (message.rescan) {
          controller.scanVisibleCandidates();
        }
        sendResponse({
          ok: true,
          route: controller.getRoute(),
          masterEnabled: controller.getSettings().masterEnabled
        });
      }
    });
  }
})();
