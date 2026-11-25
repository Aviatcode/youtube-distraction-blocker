(function () {
  'use strict';

  var YTB = globalThis.YTB;
  if (!YTB || typeof YTB.createController !== 'function') return;

  // Prevent double initialization if injected unexpectedly twice.
  if (globalThis.__ytbContentInitialized) return;
  globalThis.__ytbContentInitialized = true;

  var controller = YTB.createController({
    document: document,
    window: window,
    onSidebarDiscovered: function (items) {
      YTB.storage.mergeDiscoveredSidebarItems(items).catch(function () {
        // Ignore storage write errors on transient page unload.
      });
    }
  });

  // Apply defaults immediately at document_start, then hydrate stored user settings (~1ms).
  controller.init(YTB.createDefaultSettings());

  YTB.storage.getSettings().then(function (storedSettings) {
    controller.applySettings(storedSettings);
  }).catch(function () {
    // Keep safe defaults if storage is temporarily unavailable.
  });

  // Live instant updates from popup/options without requiring page refresh.
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== 'local') return;
      var key = YTB.STORAGE_KEYS.SETTINGS;
      if (changes && changes[key]) {
        controller.applySettings(changes[key].newValue);
      }
    });
  }

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

  // Clean up observer & timers on page teardown to avoid memory leaks.
  window.addEventListener('pagehide', function () {
    controller.destroy();
  }, { once: true });

  // Respond to popup/options status checks and manual sidebar refresh requests.
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
      if (!message || typeof message.type !== 'string') return;
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
