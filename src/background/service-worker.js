importScripts('../shared/defaults.js', '../shared/storage.js');

(function () {
  'use strict';

  var YTB = globalThis.YTB;

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

  chrome.runtime.onInstalled.addListener(async function () {
    try {
      var existing = await YTB.storage.getSettings();
      // Persist normalized settings on first install or upgrade so schema stays consistent.
      await YTB.storage.saveSettings(existing);
      await syncActionBadge(existing);
    } catch (_) {
      // Ignore storage initialization failures in restricted contexts.
    }
  });

  chrome.runtime.onStartup.addListener(function () {
    syncActionBadge();
  });

  chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName !== 'local') return;
    var key = YTB.STORAGE_KEYS.SETTINGS;
    if (changes && changes[key]) {
      var normalized = YTB.normalizeSettings(changes[key].newValue);
      syncActionBadge(normalized);
    }
  });
})();
