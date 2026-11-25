(function (root) {
  'use strict';

  var YTB = root.YTB;
  var S = YTB.selectors.SELECTORS;

  var CANDIDATE_SELECTOR = [
    S.VIDEO_CARD,
    S.POST_CARD,
    S.SHELF,
    S.PROMO,
    S.DIALOG,
    S.GUIDE_ENTRY,
    S.CHANNEL_TAB,
    S.FILTER_CHIP,
    S.CONTINUATION
  ].join(',');

  function createController(options) {
    var doc = (options && options.document) || document;
    var win = (options && options.window) || window;
    var onSidebarDiscovered = (options && options.onSidebarDiscovered) || function () {};

    var settings = YTB.createDefaultSettings();
    var observer = null;
    var pendingNodes = new Set();
    var rafId = null;
    var fallbackTimer = null;
    var sidebarSyncTimer = null;
    var sidebarStyleEl = null;
    var discoveredBuffer = [];
    var discoveredSeen = Object.create(null);
    var needsRescanOnResume = false;
    var destroyed = false;

    function getRoot() {
      return doc.documentElement;
    }

    function currentRoute() {
      return YTB.selectors.getRouteFromLocation(win.location);
    }

    function applyRootAttributes() {
      var html = getRoot();
      if (!html) return;

      html.setAttribute('data-ytb-enabled', settings.masterEnabled ? 'true' : 'false');
      html.setAttribute('data-ytb-infinite-scroll', settings.features.blockInfiniteScroll ? 'true' : 'false');
      html.setAttribute('data-ytb-shorts-tab', settings.features.blockShortsTab ? 'true' : 'false');
      html.setAttribute('data-ytb-homepage-shorts', settings.features.blockHomepageShorts ? 'true' : 'false');
      html.setAttribute('data-ytb-subscription-shorts', settings.features.blockSubscriptionShorts ? 'true' : 'false');
      html.setAttribute('data-ytb-trending', settings.features.blockTrending ? 'true' : 'false');
      html.setAttribute('data-ytb-premium', settings.features.blockPremium ? 'true' : 'false');
      html.setAttribute('data-ytb-members', settings.features.blockMembersOnly ? 'true' : 'false');
      html.setAttribute('data-ytb-playables', settings.features.blockPlayables ? 'true' : 'false');
      html.setAttribute('data-ytb-route', currentRoute());

      updateSidebarStyle();
      updateGuideSections();
      updateContinuationHelpers();
      updateBlockedPageBanners();
    }

    function ensureSidebarStyleElement() {
      if (sidebarStyleEl && sidebarStyleEl.isConnected) {
        return sidebarStyleEl;
      }
      var existing = doc.getElementById('ytb-sidebar-style');
      if (existing) {
        sidebarStyleEl = existing;
        return sidebarStyleEl;
      }
      var style = doc.createElement('style');
      style.id = 'ytb-sidebar-style';
      (doc.head || getRoot()).appendChild(style);
      sidebarStyleEl = style;
      return sidebarStyleEl;
    }

    function escapeAttrValue(value) {
      return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function updateSidebarStyle() {
      var style = ensureSidebarStyleElement();
      if (!settings.masterEnabled) {
        if (style.textContent !== '') style.textContent = '';
        return;
      }
      var hiddenKeys = Object.keys(settings.sidebarHidden || {});
      var selectors = [];
      for (var i = 0; i < hiddenKeys.length; i++) {
        var key = hiddenKeys[i];
        if (settings.sidebarHidden[key]) {
          var escaped = escapeAttrValue(key);
          selectors.push('html[data-ytb-enabled="true"] [data-ytb-sidebar-key="' + escaped + '"]');
        }
      }
      var nextCss = selectors.length > 0
        ? selectors.join(',\n') + ' {\n  display: none !important;\n}'
        : '';
      if (style.textContent !== nextCss) {
        style.textContent = nextCss;
      }
    }

    function isGuideEntryHiddenBySettings(entryEl) {
      if (!settings.masterEnabled) return false;
      if (settings.features.blockShortsTab && entryEl.getAttribute('data-ytb-shorts-tab-item') === 'true') return true;
      if (settings.features.blockTrending && entryEl.getAttribute('data-ytb-trending-item') === 'true') return true;
      if (settings.features.blockPremium && entryEl.getAttribute('data-ytb-premium-item') === 'true') return true;
      if (settings.features.blockPlayables && entryEl.getAttribute('data-ytb-playables-item') === 'true') return true;
      var sidebarKey = entryEl.getAttribute('data-ytb-sidebar-key');
      if (sidebarKey && settings.sidebarHidden[sidebarKey]) return true;
      return false;
    }

    function updateGuideSections() {
      var sections = doc.querySelectorAll(S.GUIDE_SECTION);
      for (var i = 0; i < sections.length; i++) {
        var section = sections[i];
        var entries = section.querySelectorAll('ytd-guide-entry-renderer');
        if (entries.length === 0) {
          section.removeAttribute('data-ytb-empty-section');
          continue;
        }
        var hasVisible = false;
        for (var j = 0; j < entries.length; j++) {
          var entry = entries[j];
          // Ignore guide expander toggles when checking if real navigation items remain visible.
          if (entry.closest('ytd-guide-collapsible-entry-renderer') && entry.id === 'expander-item') {
            continue;
          }
          if (!isGuideEntryHiddenBySettings(entry)) {
            hasVisible = true;
            break;
          }
        }
        if (settings.masterEnabled && !hasVisible) {
          section.setAttribute('data-ytb-empty-section', 'true');
        } else {
          section.removeAttribute('data-ytb-empty-section');
        }
      }
    }

    function safelyDismissUpsellDialog(dialogEl) {
      if (!settings.masterEnabled || !settings.features.blockPremium) return;
      if (dialogEl.getAttribute('data-ytb-premium-item') !== 'true') return;
      if (dialogEl.getAttribute('data-ytb-dismissed') === 'true') return;
      dialogEl.setAttribute('data-ytb-dismissed', 'true');

      var dismissBtn = dialogEl.querySelector(
        '#dismiss-button button, #dismiss-button, button[aria-label="Close" i], [dialog-dismiss], #cancel-button button'
      );
      if (dismissBtn && typeof dismissBtn.click === 'function') {
        try {
          dismissBtn.click();
        } catch (_) {
          // CSS still hides the dialog cleanly if dismiss click throws.
        }
      }
    }

    function scheduleSidebarDiscoveryFlush() {
      if (discoveredBuffer.length === 0) return;
      if (sidebarSyncTimer !== null) return;
      sidebarSyncTimer = win.setTimeout(function () {
        sidebarSyncTimer = null;
        if (discoveredBuffer.length === 0) return;
        var batch = discoveredBuffer.slice();
        discoveredBuffer.length = 0;
        onSidebarDiscovered(batch);
      }, 250);
    }

    function recordDiscoveredSidebarItem(info) {
      if (!info || info.dedicated || info.skipCatalog) return;
      var sig = info.key + '|' + info.label + '|' + (info.group || '');
      if (discoveredSeen[sig]) return;
      discoveredSeen[sig] = true;
      discoveredBuffer.push({
        key: info.key,
        label: info.label,
        group: info.group || 'Detected'
      });
      scheduleSidebarDiscoveryFlush();
    }

    function processSingleCandidate(el, route) {
      if (!el || el.nodeType !== 1 || !el.isConnected) return;
      if (YTB.selectors.isInsideIgnoredArea(el)) return;

      var tag = (el.tagName || '').toLowerCase();
      if (!settings.masterEnabled && tag !== 'ytd-guide-entry-renderer' && tag !== 'ytd-mini-guide-entry-renderer') {
        needsRescanOnResume = true;
        return;
      }
      if (tag === 'ytd-continuation-item-renderer' || tag === 'ytm-continuation-item-renderer') {
        handleContinuationElement(el);
        return;
      }

      var discovered = YTB.selectors.evaluateElement(el, route);
      if (discovered) {
        recordDiscoveredSidebarItem(discovered);
      }
      if (tag === 'tp-yt-paper-dialog') {
        safelyDismissUpsellDialog(el);
      }
    }

    function handleContinuationElement(el) {
      if (!settings.masterEnabled || !settings.features.blockInfiniteScroll) {
        if ('inert' in el) {
          el.inert = false;
        }
        el.removeAttribute('inert');
        el.removeAttribute('aria-hidden');
        return;
      }
      if (el.getAttribute('data-ytb-allow-continuation') === 'true') {
        if ('inert' in el) {
          el.inert = false;
        }
        el.removeAttribute('inert');
        el.removeAttribute('aria-hidden');
        return;
      }
      // Only suppress continuations inside feeds/search/related, never comments or playlists.
      var inSupportedFeed = Boolean(
        el.closest('ytd-search, ytm-search, ytd-watch-flexy #related, ytd-watch-next-secondary-results-renderer, ytm-watch-next-secondary-results-renderer') ||
        (el.closest('ytd-browse:not([page-subtype="playlist"]):not([page-subtype="history"]), ytm-browse') &&
          !el.closest('ytd-playlist-video-list-renderer'))
      );
      if (inSupportedFeed) {
        el.setAttribute('aria-hidden', 'true');
        if ('inert' in el) {
          el.inert = true;
        }
      }
    }

    function updateContinuationHelpers() {
      var allContinuations = doc.querySelectorAll(S.CONTINUATION);
      for (var i = 0; i < allContinuations.length; i++) {
        handleContinuationElement(allContinuations[i]);
      }

      var searchRoot = doc.querySelector('ytd-search');
      if (searchRoot) {
        var sectionList = searchRoot.querySelector('ytd-section-list-renderer');
        var searchPaused = searchRoot.querySelector('ytd-continuation-item-renderer:not([data-ytb-allow-continuation="true"])');
        if (sectionList) {
          var existingPager = sectionList.querySelector('.ytb-manual-pagination');
          if (settings.masterEnabled && settings.features.blockInfiniteScroll && searchPaused) {
            if (!existingPager) {
              existingPager = createManualPaginationBar(searchRoot);
              sectionList.appendChild(existingPager);
            }
            var btn = existingPager.querySelector('.ytb-manual-load-btn');
            if (btn) {
              btn.disabled = false;
              btn.textContent = 'Load more search results';
            }
          } else if (existingPager) {
            existingPager.remove();
          }
        }
      }

      var homeBrowse = doc.querySelector('ytd-browse[page-subtype="home"]');
      if (homeBrowse) {
        var grid = homeBrowse.querySelector('ytd-rich-grid-renderer');
        var homePaused = homeBrowse.querySelector('ytd-continuation-item-renderer:not([data-ytb-allow-continuation="true"])');
        if (grid) {
          var existingNote = grid.querySelector('.ytb-feed-end-note');
          if (settings.masterEnabled && settings.features.blockInfiniteScroll && homePaused) {
            if (!existingNote) {
              existingNote = doc.createElement('div');
              existingNote.className = 'ytb-feed-end-note';
              existingNote.textContent = 'Infinite scroll paused — end of loaded feed';
              grid.appendChild(existingNote);
            }
          } else if (existingNote) {
            existingNote.remove();
          }
        }
      }
    }

    function createManualPaginationBar(searchRoot) {
      var wrap = doc.createElement('div');
      wrap.className = 'ytb-manual-pagination';

      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'ytb-manual-load-btn';
      btn.textContent = 'Load more search results';
      btn.addEventListener('click', function () {
        var target = searchRoot.querySelector('ytd-continuation-item-renderer:not([data-ytb-allow-continuation="true"])');
        if (!target) {
          wrap.remove();
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Loading more results...';
        target.setAttribute('data-ytb-allow-continuation', 'true');
        target.removeAttribute('aria-hidden');
        if ('inert' in target) {
          target.inert = false;
        }
        if (typeof target.scrollIntoView === 'function') {
          try {
            target.scrollIntoView({ block: 'nearest' });
          } catch (_) {
            // Ignore scroll errors in non-layout test environments.
          }
        }
      });

      wrap.appendChild(btn);
      return wrap;
    }

    function syncBlockedPageNotice(container, shouldShow, titleText, bodyText) {
      if (!container) return;
      var existingBanner = container.querySelector('.ytb-blocked-page-banner');
      if (shouldShow) {
        if (!existingBanner) {
          var banner = doc.createElement('div');
          banner.className = 'ytb-blocked-page-banner';
          var title = doc.createElement('strong');
          title.textContent = titleText;
          var desc = doc.createElement('span');
          desc.textContent = bodyText;
          banner.appendChild(title);
          banner.appendChild(desc);
          container.appendChild(banner);
        }
      } else if (existingBanner) {
        existingBanner.remove();
      }
    }

    function updateBlockedPageBanners() {
      var route = currentRoute();
      var trendingBrowse = doc.querySelector('ytd-browse[page-subtype="trending"]');
      syncBlockedPageNotice(
        trendingBrowse,
        Boolean(settings.masterEnabled && settings.features.blockTrending && route === 'trending'),
        'Trending is hidden',
        'YouTube Distraction Blocker is hiding Trending content. Toggle "Trending content" off in the extension popup to restore it.'
      );

      var playablesBrowse = doc.querySelector('ytd-browse[page-subtype="playables"]') ||
        (route === 'playables'
          ? doc.querySelector('ytd-browse:not([page-subtype="home"]):not([page-subtype="subscriptions"]):not([page-subtype="trending"]):not([page-subtype="playlist"]):not([page-subtype="history"]):not([page-subtype="channels"])')
          : null);
      syncBlockedPageNotice(
        playablesBrowse,
        Boolean(settings.masterEnabled && settings.features.blockPlayables && route === 'playables'),
        'YouTube Playables are hidden',
        'YouTube Distraction Blocker is hiding Playables games. Toggle "YouTube Playables" off in the extension popup to restore them.'
      );
    }

    function flushPending() {
      rafId = null;
      if (fallbackTimer !== null) {
        win.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      if (destroyed || pendingNodes.size === 0) return;

      var route = currentRoute();
      var sawGuide = false;
      var sawContinuation = false;

      pendingNodes.forEach(function (node) {
        if (!node || !node.isConnected) return;
        var tag = (node.tagName || '').toLowerCase();
        if (tag === 'ytd-guide-entry-renderer' || tag === 'ytd-mini-guide-entry-renderer') {
          sawGuide = true;
        }
        if (tag === 'ytd-continuation-item-renderer' || tag === 'ytm-continuation-item-renderer') {
          sawContinuation = true;
        }
        processSingleCandidate(node, route);
      });
      pendingNodes.clear();

      if (sawGuide) {
        updateGuideSections();
      }
      if (sawContinuation || route === 'results' || route === 'home') {
        updateContinuationHelpers();
      }
    }

    function scheduleFlush() {
      if (destroyed) return;
      if (rafId !== null) return;
      if (typeof win.requestAnimationFrame === 'function') {
        rafId = win.requestAnimationFrame(flushPending);
        // Safety fallback in case tab is backgrounded and RAF pauses.
        if (fallbackTimer === null) {
          fallbackTimer = win.setTimeout(flushPending, 250);
        }
      } else {
        rafId = win.setTimeout(flushPending, 16);
      }
    }

    function collectCandidateNodesFromElement(el) {
      if (!el || el.nodeType !== 1) return;
      if (YTB.selectors.isInsideIgnoredArea(el)) return;

      if (el.matches && el.matches(CANDIDATE_SELECTOR)) {
        pendingNodes.add(el);
      }
      if (typeof el.querySelectorAll === 'function') {
        var descendants = el.querySelectorAll(CANDIDATE_SELECTOR);
        for (var i = 0; i < descendants.length; i++) {
          pendingNodes.add(descendants[i]);
        }
      }
    }

    function handleMutations(mutations) {
      if (destroyed) return;
      var lastIgnored = null;
      var lastAllowed = null;

      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        var target = m.target;
        if (target === lastIgnored) continue;
        if (target !== lastAllowed) {
          if (YTB.selectors.isInsideIgnoredArea(target)) {
            lastIgnored = target;
            continue;
          }
          lastAllowed = target;
        }

        if (m.type === 'childList') {
          if (!settings.masterEnabled) {
            // While paused, only collect sidebar entries for discovery and mark rescan needed for resume.
            for (var k = 0; k < m.addedNodes.length; k++) {
              var added = m.addedNodes[k];
              if (!added || added.nodeType !== 1) continue;
              if (added.matches && added.matches(YTB.selectors.SELECTORS.GUIDE_ENTRY)) {
                pendingNodes.add(added);
              } else if (typeof added.querySelectorAll === 'function') {
                var guideItems = added.querySelectorAll(YTB.selectors.SELECTORS.GUIDE_ENTRY);
                for (var g = 0; g < guideItems.length; g++) {
                  pendingNodes.add(guideItems[g]);
                }
              }
            }
            needsRescanOnResume = true;
            continue;
          }

          // Re-evaluate enclosing card/shelf if Polymer swaps badges/links inside a recycled node.
          if (target && target.nodeType === 1 && typeof target.closest === 'function') {
            var parentCandidate = target.closest(CANDIDATE_SELECTOR);
            if (parentCandidate) {
              pendingNodes.add(parentCandidate);
            }
          }
          for (var j = 0; j < m.addedNodes.length; j++) {
            collectCandidateNodesFromElement(m.addedNodes[j]);
          }
        }
      }
      if (pendingNodes.size > 0) {
        scheduleFlush();
      }
    }

    function scanVisibleCandidates() {
      var route = currentRoute();
      var elements = doc.querySelectorAll(CANDIDATE_SELECTOR);
      for (var i = 0; i < elements.length; i++) {
        processSingleCandidate(elements[i], route);
      }
      updateGuideSections();
      updateContinuationHelpers();
      updateBlockedPageBanners();
    }

    function startObserver() {
      if (observer || destroyed) return;
      var target = doc.body || getRoot();
      if (!target || typeof MutationObserver !== 'function') return;

      observer = new MutationObserver(handleMutations);
      observer.observe(target, {
        childList: true,
        subtree: true
      });
    }

    function stopObserver() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      pendingNodes.clear();
    }

    function applySettings(nextSettings) {
      var prevMaster = settings.masterEnabled;
      var prevInfinite = settings.features.blockInfiniteScroll;
      settings = YTB.normalizeSettings(nextSettings);
      applyRootAttributes();

      if (!doc.body) return;

      // Only scan the DOM if resuming from paused state or enabling infinite scroll on loaded continuations.
      if ((!prevMaster && settings.masterEnabled && needsRescanOnResume) ||
          (!prevInfinite && settings.features.blockInfiniteScroll)) {
        needsRescanOnResume = false;
        scanVisibleCandidates();
      }
    }

    function handleNavigation() {
      applyRootAttributes();
      if (doc.body) {
        scanVisibleCandidates();
      }
    }

    function init(initialSettings) {
      settings = YTB.normalizeSettings(initialSettings);
      applyRootAttributes();

      if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', function onReady() {
          doc.removeEventListener('DOMContentLoaded', onReady);
          startObserver();
          scanVisibleCandidates();
        });
      } else {
        startObserver();
        scanVisibleCandidates();
      }
    }

    function destroy() {
      destroyed = true;
      stopObserver();
      if (rafId !== null && typeof win.cancelAnimationFrame === 'function') {
        win.cancelAnimationFrame(rafId);
      }
      if (fallbackTimer !== null) win.clearTimeout(fallbackTimer);
      if (sidebarSyncTimer !== null) win.clearTimeout(sidebarSyncTimer);
    }

    return {
      init: init,
      applySettings: applySettings,
      handleNavigation: handleNavigation,
      scanVisibleCandidates: scanVisibleCandidates,
      flushPending: flushPending,
      destroy: destroy,
      getRoute: currentRoute,
      getSettings: function () { return YTB.normalizeSettings(settings); }
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createController: createController };
  }
  root.YTB = Object.assign(root.YTB || {}, { createController: createController });
})(typeof globalThis !== 'undefined' ? globalThis : self);
