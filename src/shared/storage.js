(function (root) {
  'use strict';

  var YTB = root.YTB || (typeof require !== 'undefined' ? require('./defaults.js') : null);

  function getChromeStorageArea(storageOverride) {
    if (storageOverride) return storageOverride;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
    return null;
  }

  function storageGet(area, key) {
    return new Promise(function (resolve, reject) {
      try {
        area.get([key], function (result) {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(result ? result[key] : undefined);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  function storageSet(area, obj) {
    return new Promise(function (resolve, reject) {
      try {
        area.set(obj, function () {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async function getSettings(storageOverride) {
    var area = getChromeStorageArea(storageOverride);
    if (!area) {
      return YTB.createDefaultSettings();
    }
    var raw = await storageGet(area, YTB.STORAGE_KEYS.SETTINGS);
    return YTB.normalizeSettings(raw);
  }

  async function saveSettings(nextSettings, storageOverride) {
    var normalized = YTB.normalizeSettings(nextSettings);
    var area = getChromeStorageArea(storageOverride);
    if (area) {
      var payload = {};
      payload[YTB.STORAGE_KEYS.SETTINGS] = normalized;
      await storageSet(area, payload);
    }
    return normalized;
  }

  async function updateFeature(featureId, enabled, storageOverride) {
    var current = await getSettings(storageOverride);
    if (Object.prototype.hasOwnProperty.call(current.features, featureId)) {
      current.features[featureId] = Boolean(enabled);
    }
    return saveSettings(current, storageOverride);
  }

  async function setMasterEnabled(enabled, storageOverride) {
    var current = await getSettings(storageOverride);
    current.masterEnabled = Boolean(enabled);
    return saveSettings(current, storageOverride);
  }

  async function setSidebarItemHidden(sidebarKey, hidden, storageOverride) {
    var current = await getSettings(storageOverride);
    if (hidden) {
      current.sidebarHidden[sidebarKey] = true;
    } else {
      delete current.sidebarHidden[sidebarKey];
    }
    return saveSettings(current, storageOverride);
  }

  async function restoreDefaults(storageOverride) {
    var defaults = YTB.createDefaultSettings();
    return saveSettings(defaults, storageOverride);
  }

  async function getDiscoveredSidebarItems(storageOverride) {
    var area = getChromeStorageArea(storageOverride);
    if (!area) return [];
    var raw = await storageGet(area, YTB.STORAGE_KEYS.SIDEBAR_DISCOVERED);
    return YTB.sanitizeDiscoveredSidebarItems(raw);
  }

  /**
   * Merge newly discovered YouTube sidebar items into storage only when changed,
   * avoiding unnecessary storage writes and preserving settings isolation.
   */
  async function mergeDiscoveredSidebarItems(items, storageOverride) {
    var area = getChromeStorageArea(storageOverride);
    var incoming = YTB.sanitizeDiscoveredSidebarItems(items);
    if (!area || incoming.length === 0) {
      return incoming;
    }

    var existing = await getDiscoveredSidebarItems(area);
    var byKey = Object.create(null);
    var ordered = [];

    for (var i = 0; i < existing.length; i++) {
      byKey[existing[i].key] = existing[i];
      ordered.push(existing[i]);
    }

    var changed = false;
    for (var j = 0; j < incoming.length; j++) {
      var nextItem = incoming[j];
      var prev = byKey[nextItem.key];
      if (!prev) {
        byKey[nextItem.key] = nextItem;
        ordered.push(nextItem);
        changed = true;
      } else if (prev.label !== nextItem.label || prev.group !== nextItem.group) {
        prev.label = nextItem.label;
        prev.group = nextItem.group;
        changed = true;
      }
    }

    var sanitized = YTB.sanitizeDiscoveredSidebarItems(ordered);
    if (changed) {
      var payload = {};
      payload[YTB.STORAGE_KEYS.SIDEBAR_DISCOVERED] = sanitized;
      await storageSet(area, payload);
    }
    return sanitized;
  }

  var storageApi = {
    getSettings: getSettings,
    saveSettings: saveSettings,
    updateFeature: updateFeature,
    setMasterEnabled: setMasterEnabled,
    setSidebarItemHidden: setSidebarItemHidden,
    restoreDefaults: restoreDefaults,
    getDiscoveredSidebarItems: getDiscoveredSidebarItems,
    mergeDiscoveredSidebarItems: mergeDiscoveredSidebarItems
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = storageApi;
  }
  root.YTB = Object.assign(root.YTB || {}, { storage: storageApi });
})(typeof globalThis !== 'undefined' ? globalThis : self);
