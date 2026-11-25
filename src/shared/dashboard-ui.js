(function (root) {
  'use strict';

  var YTB = root.YTB;

  function createSwitchButton(checked, ariaLabel, onToggle) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'switch';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', checked ? 'true' : 'false');
    btn.setAttribute('aria-label', ariaLabel);

    var thumb = document.createElement('span');
    thumb.className = 'switch-thumb';
    btn.appendChild(thumb);

    btn.addEventListener('click', function () {
      var next = btn.getAttribute('aria-checked') !== 'true';
      onToggle(next);
    });
    return btn;
  }

  function formatBadgeState(isOn, masterEnabled, onLabel, offLabel) {
    if (!masterEnabled && isOn) {
      return { text: 'Paused', cls: 'state-badge is-paused' };
    }
    return isOn
      ? { text: onLabel, cls: 'state-badge is-on' }
      : { text: offLabel, cls: 'state-badge' };
  }

  function mergeSidebarDisplayList(discoveredItems) {
    var byKey = Object.create(null);
    var ordered = [];

    for (var i = 0; i < YTB.SIDEBAR_CATALOG.length; i++) {
      var preset = YTB.SIDEBAR_CATALOG[i];
      var copy = {
        key: preset.key,
        label: preset.label,
        group: preset.group,
        detected: false
      };
      byKey[copy.key] = copy;
      ordered.push(copy);
    }

    var discovered = Array.isArray(discoveredItems) ? discoveredItems : [];
    for (var j = 0; j < discovered.length; j++) {
      var item = discovered[j];
      if (!item || !item.key || YTB.DEDICATED_SIDEBAR_KEYS[item.key]) continue;
      if (byKey[item.key]) {
        byKey[item.key].label = item.label || byKey[item.key].label;
        byKey[item.key].detected = true;
      } else {
        var added = {
          key: item.key,
          label: item.label,
          group: item.group || 'Detected',
          detected: true
        };
        byKey[added.key] = added;
        ordered.push(added);
      }
    }

    return ordered;
  }

  function initDashboard(options) {
    var showDescriptions = Boolean(options && options.showDescriptions);
    var els = {
      statusPill: document.getElementById('status-pill'),
      masterMount: document.getElementById('master-switch-mount'),
      pausedBanner: document.getElementById('paused-banner'),
      contentArea: document.getElementById('content-area'),
      groupsMount: document.getElementById('feature-groups-mount'),
      sidebarList: document.getElementById('sidebar-list'),
      sidebarSummary: document.getElementById('sidebar-summary'),
      sidebarFilter: document.getElementById('sidebar-filter'),
      refreshSidebarBtn: document.getElementById('refresh-sidebar-btn'),
      restoreDefaultsBtn: document.getElementById('restore-defaults-btn'),
      footerStatus: document.getElementById('footer-status'),
      openOptionsBtn: document.getElementById('open-options-btn')
    };

    var currentSettings = YTB.createDefaultSettings();
    var discoveredSidebar = [];
    var sidebarSearchTerm = '';
    var toastTimer = null;
    var defaultFooterText = 'Local settings · No data collected';

    function showFooterToast(text) {
      if (!els.footerStatus) return;
      els.footerStatus.textContent = text;
      els.footerStatus.classList.add('is-toast');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        els.footerStatus.textContent = defaultFooterText;
        els.footerStatus.classList.remove('is-toast');
      }, 2200);
    }

    function countActiveRules(settings) {
      var count = 0;
      var keys = Object.keys(settings.features);
      for (var i = 0; i < keys.length; i++) {
        if (settings.features[keys[i]]) count++;
      }
      var sidebarKeys = Object.keys(settings.sidebarHidden || {});
      for (var j = 0; j < sidebarKeys.length; j++) {
        if (settings.sidebarHidden[sidebarKeys[j]]) count++;
      }
      return count;
    }

    function renderHeader() {
      var activeCount = countActiveRules(currentSettings);
      if (currentSettings.masterEnabled) {
        els.statusPill.textContent = 'Active · ' + activeCount + (activeCount === 1 ? ' rule on' : ' rules on');
        els.statusPill.classList.remove('is-paused');
        els.pausedBanner.hidden = true;
        els.contentArea.classList.remove('is-paused');
      } else {
        els.statusPill.textContent = 'Paused · Rules preserved';
        els.statusPill.classList.add('is-paused');
        els.pausedBanner.hidden = false;
        els.contentArea.classList.add('is-paused');
      }

      els.masterMount.textContent = '';
      var masterSwitch = createSwitchButton(
        currentSettings.masterEnabled,
        'Master protection switch',
        async function (next) {
          currentSettings = await YTB.storage.setMasterEnabled(next);
          renderAll();
          showFooterToast(next ? 'Protection enabled' : 'Protection paused');
        }
      );
      els.masterMount.appendChild(masterSwitch);
    }

    function renderFeatureGroups() {
      els.groupsMount.textContent = '';
      var groups = YTB.FEATURE_GROUPS;
      var defs = YTB.FEATURE_DEFINITIONS;

      for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        var groupFeatures = [];
        for (var f = 0; f < defs.length; f++) {
          if (defs[f].group === group.id) {
            groupFeatures.push(defs[f]);
          }
        }
        if (groupFeatures.length === 0) continue;

        var card = document.createElement('section');
        card.className = 'section-card';

        var header = document.createElement('div');
        header.className = 'section-header';

        var title = document.createElement('h2');
        title.className = 'section-title';
        title.textContent = group.title;

        var activeInGroup = 0;
        for (var k = 0; k < groupFeatures.length; k++) {
          if (currentSettings.features[groupFeatures[k].id]) activeInGroup++;
        }

        var meta = document.createElement('span');
        meta.className = 'section-meta';
        meta.textContent = activeInGroup + '/' + groupFeatures.length + ' on';

        header.appendChild(title);
        header.appendChild(meta);
        card.appendChild(header);

        var list = document.createElement('div');
        list.className = 'rows-list';

        for (var i = 0; i < groupFeatures.length; i++) {
          list.appendChild(buildFeatureRow(groupFeatures[i]));
        }

        card.appendChild(list);
        els.groupsMount.appendChild(card);
      }
    }

    function buildFeatureRow(def) {
      var isOn = Boolean(currentSettings.features[def.id]);
      var row = document.createElement('div');
      row.className = 'toggle-row';
      row.setAttribute('data-feature-id', def.id);

      var info = document.createElement('div');
      info.className = 'toggle-info';

      var label = document.createElement('span');
      label.className = 'toggle-label';
      label.textContent = def.label;
      info.appendChild(label);

      if (showDescriptions || def.description) {
        var desc = document.createElement('p');
        desc.className = 'toggle-desc';
        desc.textContent = def.description;
        info.appendChild(desc);
      }

      var actions = document.createElement('div');
      actions.className = 'toggle-actions';

      var stateInfo = formatBadgeState(isOn, currentSettings.masterEnabled, 'Enabled', 'Off');
      var badge = document.createElement('span');
      badge.className = stateInfo.cls;
      badge.textContent = stateInfo.text;

      var sw = createSwitchButton(isOn, def.label, async function (next) {
        currentSettings = await YTB.storage.updateFeature(def.id, next);
        renderAll();
      });

      actions.appendChild(badge);
      actions.appendChild(sw);

      row.appendChild(info);
      row.appendChild(actions);
      return row;
    }

    function renderSidebarList() {
      var allItems = mergeSidebarDisplayList(discoveredSidebar);
      var hiddenCount = 0;
      for (var c = 0; c < allItems.length; c++) {
        if (currentSettings.sidebarHidden[allItems[c].key]) hiddenCount++;
      }

      els.sidebarSummary.textContent = hiddenCount + ' hidden · ' + allItems.length + ' items';
      els.sidebarList.textContent = '';

      var query = sidebarSearchTerm.trim().toLowerCase();
      var visibleItems = [];
      for (var i = 0; i < allItems.length; i++) {
        var item = allItems[i];
        if (!query || item.label.toLowerCase().indexOf(query) !== -1 || item.group.toLowerCase().indexOf(query) !== -1) {
          visibleItems.push(item);
        }
      }

      if (visibleItems.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No matching sidebar entries found.';
        els.sidebarList.appendChild(empty);
        return;
      }

      for (var j = 0; j < visibleItems.length; j++) {
        els.sidebarList.appendChild(buildSidebarRow(visibleItems[j]));
      }
    }

    function buildSidebarRow(item) {
      var isHidden = Boolean(currentSettings.sidebarHidden[item.key]);
      var row = document.createElement('div');
      row.className = 'toggle-row';
      row.setAttribute('data-sidebar-key', item.key);

      var info = document.createElement('div');
      info.className = 'toggle-info';

      var titleLine = document.createElement('div');
      titleLine.className = 'toggle-title-line';

      var label = document.createElement('span');
      label.className = 'toggle-label';
      label.textContent = item.label;

      var chip = document.createElement('span');
      chip.className = 'group-chip';
      chip.textContent = item.detected ? item.group + ' · Detected' : item.group;

      titleLine.appendChild(label);
      titleLine.appendChild(chip);
      info.appendChild(titleLine);

      var actions = document.createElement('div');
      actions.className = 'toggle-actions';

      var stateInfo = formatBadgeState(isHidden, currentSettings.masterEnabled, 'Hidden', 'Visible');
      var badge = document.createElement('span');
      badge.className = stateInfo.cls;
      badge.textContent = stateInfo.text;

      var sw = createSwitchButton(isHidden, 'Hide ' + item.label + ' in sidebar', async function (next) {
        currentSettings = await YTB.storage.setSidebarItemHidden(item.key, next);
        renderAll();
      });

      actions.appendChild(badge);
      actions.appendChild(sw);

      row.appendChild(info);
      row.appendChild(actions);
      return row;
    }

    function renderAll() {
      renderHeader();
      renderFeatureGroups();
      renderSidebarList();
    }

    function pingActiveYouTubeTab(rescan) {
      if (typeof chrome === 'undefined' || !chrome.tabs) return;
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (chrome.runtime && chrome.runtime.lastError) return;
          if (!tabs || !tabs[0]) return;
          chrome.tabs.sendMessage(tabs[0].id, { type: 'YTB_PING_TAB', rescan: Boolean(rescan) }, function (res) {
            if (chrome.runtime && chrome.runtime.lastError) {
              return;
            }
            if (res && res.ok) {
              defaultFooterText = 'Connected · YouTube (' + res.route + ')';
              if (els.footerStatus && !els.footerStatus.classList.contains('is-toast')) {
                els.footerStatus.textContent = defaultFooterText;
              }
              if (rescan) {
                setTimeout(async function () {
                  discoveredSidebar = await YTB.storage.getDiscoveredSidebarItems();
                  renderSidebarList();
                  showFooterToast('Sidebar scan refreshed');
                }, 320);
              }
            } else if (rescan) {
              showFooterToast('Open a YouTube tab to detect account items');
            }
          });
        });
      } catch (_) {
        // Ignore tab messaging errors when opened standalone.
      }
    }

    async function load() {
      var results = await Promise.all([
        YTB.storage.getSettings(),
        YTB.storage.getDiscoveredSidebarItems()
      ]);
      currentSettings = results[0];
      discoveredSidebar = results[1];
      renderAll();
      pingActiveYouTubeTab(false);
    }

    if (els.sidebarFilter) {
      els.sidebarFilter.addEventListener('input', function (e) {
        sidebarSearchTerm = e.target.value || '';
        renderSidebarList();
      });
    }

    if (els.refreshSidebarBtn) {
      els.refreshSidebarBtn.addEventListener('click', function () {
        pingActiveYouTubeTab(true);
      });
    }

    if (els.restoreDefaultsBtn) {
      els.restoreDefaultsBtn.addEventListener('click', async function () {
        currentSettings = await YTB.storage.restoreDefaults();
        renderAll();
        showFooterToast('Defaults restored');
      });
    }

    if (els.openOptionsBtn && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
      els.openOptionsBtn.addEventListener('click', function () {
        chrome.runtime.openOptionsPage();
      });
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, areaName) {
        if (areaName !== 'local') return;
        if (changes[YTB.STORAGE_KEYS.SETTINGS]) {
          currentSettings = YTB.normalizeSettings(changes[YTB.STORAGE_KEYS.SETTINGS].newValue);
          renderAll();
        }
        if (changes[YTB.STORAGE_KEYS.SIDEBAR_DISCOVERED]) {
          discoveredSidebar = YTB.sanitizeDiscoveredSidebarItems(
            changes[YTB.STORAGE_KEYS.SIDEBAR_DISCOVERED].newValue
          );
          renderSidebarList();
        }
      });
    }

    load();
  }

  root.YTB = Object.assign(root.YTB || {}, {
    dashboardUI: {
      initDashboard: initDashboard,
      mergeSidebarDisplayList: mergeSidebarDisplayList
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
