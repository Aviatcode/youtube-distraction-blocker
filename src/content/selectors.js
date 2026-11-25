(function (root) {
  'use strict';

  var YTB = root.YTB || (typeof require !== 'undefined' ? require('../shared/defaults.js') : null);

  /**
   * Centralized YouTube DOM selectors & classification heuristics.
   * Update this file first when YouTube introduces new element tags or badge structures.
   */
  var SELECTORS = Object.freeze({
    // Card & post wrappers evaluated incrementally on insertion/recycling.
    VIDEO_CARD: [
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-playlist-video-renderer',
      'yt-lockup-view-model',
      'ytd-reel-item-renderer',
      'ytm-video-with-context-renderer',
      'ytm-rich-item-renderer'
    ].join(','),

    POST_CARD: [
      'ytd-backstage-post-thread-renderer',
      'ytd-post-renderer',
      'ytd-backstage-post-renderer'
    ].join(','),

    SHELF: [
      'ytd-rich-section-renderer',
      'ytd-rich-shelf-renderer',
      'ytd-reel-shelf-renderer',
      'ytd-shelf-renderer',
      'ytd-recognition-shelf-renderer',
      'grid-shelf-view-model',
      'ytm-reel-shelf-renderer',
      'ytm-rich-section-renderer'
    ].join(','),

    PROMO: [
      'ytd-mealbar-promo-renderer',
      'ytd-banner-promo-renderer',
      'ytd-statement-banner-renderer',
      'ytd-primetime-promo-renderer',
      'ytd-background-promo-renderer',
      'ytd-upsell-dialog-renderer'
    ].join(','),

    DIALOG: 'tp-yt-paper-dialog',

    GUIDE_ENTRY: 'ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytm-pivot-bar-item-renderer',
    GUIDE_SECTION: 'ytd-guide-section-renderer',
    CHANNEL_TAB: 'yt-tab-shape, tp-yt-paper-tab',
    FILTER_CHIP: 'yt-chip-cloud-chip-renderer',
    CONTINUATION: 'ytd-continuation-item-renderer, ytm-continuation-item-renderer',

    // Badge elements ONLY (never check #video-title, channel names, or descriptions!).
    BADGE_NODES: [
      'ytd-sponsors-only-badge-renderer',
      '#sponsors-only-badge',
      'ytd-badge-supported-renderer .badge',
      'ytd-badge-supported-renderer p',
      'badge-shape',
      'yt-badge-shape',
      '.yt-badge-shape',
      '.badge-style-type-members-only',
      '.badge-style-type-premium',
      '.badge-style-type-ypc'
    ].join(','),

    SHORTS_INDICATORS: [
      'a[href^="/shorts/"]',
      'a[href*="/shorts/"]',
      'ytm-shorts-lockup-view-model',
      'ytm-shorts-lockup-view-model-v2',
      'ytd-reel-item-renderer',
      'ytd-reel-shelf-renderer',
      'ytd-rich-shelf-renderer[is-shorts]'
    ].join(',')
  });

  // Exact badge phrases across English and major YouTube locales for Members-only content.
  var MEMBERS_BADGE_EXACT = Object.freeze([
    'members only',
    'members-only',
    'members first',
    'solo para miembros',
    'miembros del canal',
    'uniquement pour les membres',
    'réservé aux membres',
    'nur für mitglieder',
    'só para membros',
    'apenas para membros',
    'solo per i membri',
    'alleen voor leden',
    'tylko dla wspierających',
    'üye olanlara özel',
    'メンバー限定',
    '회원 전용',
    'только для спонсоров',
    'khusus pelanggan'
  ]);

  var MEMBERS_SHELF_TITLES = Object.freeze([
    'members-only videos',
    'members only',
    'members-only',
    'channel members',
    'our members',
    'channel memberships'
  ]);

  var PREMIUM_BADGE_EXACT = Object.freeze([
    'premium',
    'youtube premium',
    'included with premium'
  ]);

  var PREMIUM_PROMO_PHRASES = Object.freeze([
    'youtube premium',
    'music premium',
    'try youtube premium',
    'get youtube premium',
    'ad-free',
    'skip ads with premium'
  ]);

  var SHORTS_TAB_LABELS = Object.freeze([
    'shorts',
    'youtube shorts'
  ]);

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isElement(node) {
    return Boolean(node && node.nodeType === 1);
  }

  function getAttributeSafe(el, name) {
    return el && typeof el.getAttribute === 'function' ? el.getAttribute(name) : null;
  }

  function getTextSafe(el) {
    return el ? normalizeText(el.textContent) : '';
  }

  function matchesExactPhrase(text, phrases) {
    if (!text) return false;
    for (var i = 0; i < phrases.length; i++) {
      if (text === phrases[i]) return true;
    }
    return false;
  }

  function containsAnyPhrase(text, phrases) {
    if (!text) return false;
    for (var i = 0; i < phrases.length; i++) {
      if (text.indexOf(phrases[i]) !== -1) return true;
    }
    return false;
  }

  function isInsideIgnoredArea(node) {
    if (!isElement(node) || typeof node.closest !== 'function') return false;
    return Boolean(node.closest('#movie_player, ytd-player, #comments, ytd-comments, #chat'));
  }

  /**
   * Resolve the outermost feed card wrapper so CSS grid cells collapse cleanly without empty gaps.
   */
  function getOutermostCard(el) {
    if (!isElement(el) || typeof el.closest !== 'function') return el;
    var richItem = el.closest('ytd-rich-item-renderer, ytm-rich-item-renderer');
    if (richItem) return richItem;
    var card = el.closest(SELECTORS.VIDEO_CARD);
    return card || el;
  }

  function getRouteFromLocation(loc) {
    var path = (loc && loc.pathname) ? loc.pathname : '/';
    if (path === '/' || path === '') return 'home';
    if (path.indexOf('/watch') === 0) return 'watch';
    if (path.indexOf('/results') === 0) return 'results';
    if (path.indexOf('/shorts') === 0) return 'shorts';
    if (path.indexOf('/feed/trending') === 0 || path.indexOf('/feed/explore') === 0) return 'trending';
    if (path.indexOf('/feed/subscriptions') === 0) return 'subscriptions';
    if (path.indexOf('/channel/') === 0 || path.indexOf('/@') === 0 || path.indexOf('/c/') === 0 || path.indexOf('/user/') === 0) {
      return 'channel';
    }
    return 'other';
  }

  function isMembersBadgeElement(badgeEl) {
    if (!isElement(badgeEl)) return false;
    var tag = (badgeEl.tagName || '').toLowerCase();
    if (tag === 'ytd-sponsors-only-badge-renderer' || badgeEl.id === 'sponsors-only-badge') {
      return true;
    }
    if (badgeEl.classList && badgeEl.classList.contains('badge-style-type-members-only')) {
      return true;
    }

    var aria = normalizeText(getAttributeSafe(badgeEl, 'aria-label'));
    if (matchesExactPhrase(aria, MEMBERS_BADGE_EXACT) || aria.indexOf('members only') !== -1 || aria.indexOf('members-only') !== -1) {
      return true;
    }

    var text = getTextSafe(badgeEl);
    return matchesExactPhrase(text, MEMBERS_BADGE_EXACT);
  }

  function isMembersOnlyCard(cardEl) {
    if (!isElement(cardEl)) return false;
    var badges = cardEl.querySelectorAll(SELECTORS.BADGE_NODES);
    for (var i = 0; i < badges.length; i++) {
      if (isMembersBadgeElement(badges[i])) {
        return true;
      }
    }
    return false;
  }

  function isMembersOnlyShelf(shelfEl) {
    if (!isElement(shelfEl)) return false;
    var tag = (shelfEl.tagName || '').toLowerCase();
    if (tag === 'ytd-recognition-shelf-renderer') return true;
    if (shelfEl.querySelector('ytd-recognition-shelf-renderer, ytd-sponsorships-tier-renderer, ytd-membership-offer-renderer')) {
      return true;
    }

    var header = shelfEl.querySelector('#title, #title-text, h2');
    var headerText = getTextSafe(header);
    if (matchesExactPhrase(headerText, MEMBERS_SHELF_TITLES)) {
      return true;
    }

    var cards = shelfEl.querySelectorAll(SELECTORS.VIDEO_CARD);
    if (cards.length > 0) {
      var allMembers = true;
      for (var i = 0; i < cards.length; i++) {
        if (!isMembersOnlyCard(cards[i])) {
          allMembers = false;
          break;
        }
      }
      if (allMembers) return true;
    }

    return false;
  }

  function isPremiumBadgeElement(badgeEl) {
    if (!isElement(badgeEl)) return false;
    if (badgeEl.classList && badgeEl.classList.contains('badge-style-type-premium')) {
      return true;
    }
    var aria = normalizeText(getAttributeSafe(badgeEl, 'aria-label'));
    if (matchesExactPhrase(aria, PREMIUM_BADGE_EXACT)) {
      return true;
    }
    var text = getTextSafe(badgeEl);
    return matchesExactPhrase(text, PREMIUM_BADGE_EXACT);
  }

  function hasPremiumLink(el) {
    if (!isElement(el)) return false;
    var links = el.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var href = String(getAttributeSafe(links[i], 'href') || '').toLowerCase();
      if (
        href === '/premium' ||
        href.indexOf('/premium?') === 0 ||
        href.indexOf('youtube.com/premium') !== -1 ||
        href.indexOf('premium_offer') !== -1
      ) {
        return true;
      }
    }
    return false;
  }

  function isPremiumPromoElement(el) {
    if (!isElement(el)) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'ytd-upsell-dialog-renderer') return true;

    // Never hide neutral system states inside ytd-background-promo-renderer unless explicitly Premium.
    if (hasPremiumLink(el)) return true;

    if (tag === 'ytd-mealbar-promo-renderer' || tag === 'ytd-banner-promo-renderer' || tag === 'ytd-statement-banner-renderer') {
      var text = getTextSafe(el);
      return containsAnyPhrase(text, PREMIUM_PROMO_PHRASES);
    }

    return false;
  }

  function isPremiumCard(cardEl) {
    if (!isElement(cardEl)) return false;
    var badges = cardEl.querySelectorAll(SELECTORS.BADGE_NODES);
    for (var i = 0; i < badges.length; i++) {
      if (isPremiumBadgeElement(badges[i])) {
        return true;
      }
    }
    return false;
  }

  function isShortsLink(href) {
    if (!href) return false;
    var lower = String(href).trim().toLowerCase();
    if (lower === '/shorts' || lower.indexOf('/shorts/') === 0 || lower.indexOf('/shorts?') === 0) {
      return true;
    }
    try {
      var parsed = new URL(href, 'https://www.youtube.com');
      return parsed.pathname === '/shorts' || parsed.pathname.indexOf('/shorts/') === 0;
    } catch (_) {
      return lower.indexOf('/shorts/') !== -1;
    }
  }

  function isShortsCardOrShelf(el) {
    if (!isElement(el)) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'ytd-reel-shelf-renderer' || tag === 'ytm-reel-shelf-renderer' || tag === 'ytd-reel-item-renderer') {
      return true;
    }
    if (tag === 'ytd-rich-shelf-renderer' && el.hasAttribute('is-shorts')) {
      return true;
    }
    if (el.querySelector('ytd-rich-shelf-renderer[is-shorts], ytd-reel-shelf-renderer, ytm-reel-shelf-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytd-reel-item-renderer')) {
      return true;
    }

    // Check shelf header exact title when shelf structure changes.
    if (tag === 'ytd-rich-section-renderer' || tag === 'ytd-rich-shelf-renderer' || tag === 'grid-shelf-view-model') {
      var heading = el.querySelector('#title, #title-text, h2');
      if (matchesExactPhrase(getTextSafe(heading), SHORTS_TAB_LABELS)) {
        return true;
      }
    }

    // Check links inside card/shelf (excluding description text links by checking thumbnail/title anchors).
    var anchors = el.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var href = getAttributeSafe(anchors[i], 'href');
      if (isShortsLink(href)) {
        return true;
      }
    }
    return false;
  }

  function isTrendingShelfOrChip(el) {
    if (!isElement(el)) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'yt-chip-cloud-chip-renderer') {
      return getTextSafe(el) === 'trending';
    }
    var titleLinks = el.querySelectorAll('#title-container a[href], h2 a[href], #header a[href]');
    for (var i = 0; i < titleLinks.length; i++) {
      var href = String(getAttributeSafe(titleLinks[i], 'href') || '').toLowerCase();
      if (href.indexOf('/feed/trending') === 0 || href.indexOf('youtube.com/feed/trending') !== -1) {
        return true;
      }
    }
    var heading = el.querySelector('#title, #title-text, h2');
    var text = getTextSafe(heading);
    return text === 'trending' || text === 'trending videos' || text === 'trending now';
  }

  function isShortsTabElement(el) {
    if (!isElement(el)) return false;
    var tag = (el.tagName || '').toLowerCase();

    if (tag === 'yt-tab-shape') {
      var tabTitle = normalizeText(getAttributeSafe(el, 'tab-title'));
      if (matchesExactPhrase(tabTitle, SHORTS_TAB_LABELS)) return true;
    }
    if (tag === 'tp-yt-paper-tab' || tag === 'yt-tab-shape') {
      var tabText = getTextSafe(el);
      var aria = normalizeText(getAttributeSafe(el, 'aria-label'));
      if (matchesExactPhrase(tabText, SHORTS_TAB_LABELS) || matchesExactPhrase(aria, SHORTS_TAB_LABELS)) {
        return true;
      }
    }
    if (tag === 'yt-chip-cloud-chip-renderer') {
      // Only hide Shorts chip inside browse feeds, never on Search where user might search "shorts".
      if (el.closest('ytd-browse') && matchesExactPhrase(getTextSafe(el), SHORTS_TAB_LABELS)) {
        return true;
      }
      return false;
    }
    if (tag === 'ytm-pivot-bar-item-renderer') {
      if (el.querySelector('.pivot-shorts') || matchesExactPhrase(getTextSafe(el), SHORTS_TAB_LABELS)) {
        return true;
      }
    }
    return false;
  }

  function isSubscribedChannelEntry(entryEl) {
    if (!isElement(entryEl)) return false;
    // Subscribed channels render user avatar elements/images, whereas categories use yt-icon.
    if (entryEl.querySelector('yt-img-shadow, yt-avatar-shape, img#img[src*="yt3.ggpht.com"], img[src*="googleusercontent.com"]')) {
      return true;
    }
    var anchor = entryEl.querySelector('a[href]');
    var href = String(getAttributeSafe(anchor, 'href') || '');
    if (href.indexOf('/@') === 0) {
      return true;
    }
    return false;
  }

  function extractSidebarEntryInfo(entryEl) {
    if (!isElement(entryEl)) return null;
    if (isSubscribedChannelEntry(entryEl)) return null;

    var anchor = entryEl.querySelector('a#endpoint, a[href]') || entryEl;
    var href = getAttributeSafe(anchor, 'href') || '';
    var titleAttr = getAttributeSafe(anchor, 'title') || getAttributeSafe(anchor, 'aria-label') || '';
    var titleEl = entryEl.querySelector('yt-formatted-string.title, .title, .pivot-bar-item-tab');
    var label = String((titleEl && titleEl.textContent) || titleAttr || '').replace(/\s+/g, ' ').trim();

    if (!label && !href) return null;

    var section = typeof entryEl.closest === 'function' ? entryEl.closest('ytd-guide-section-renderer') : null;
    var sectionTitleEl = section ? section.querySelector('#guide-section-title, h3') : null;
    var sectionLabel = sectionTitleEl ? String(sectionTitleEl.textContent || '').replace(/\s+/g, ' ').trim() : '';

    var resolved = YTB.resolveSidebarEntry({
      href: href,
      label: label,
      sectionLabel: sectionLabel
    });

    if (!resolved) return null;
    return resolved;
  }

  function setBooleanAttr(el, attrName, value) {
    if (!isElement(el)) return;
    if (value) {
      if (el.getAttribute(attrName) !== 'true') {
        el.setAttribute(attrName, 'true');
      }
    } else if (el.hasAttribute(attrName)) {
      el.removeAttribute(attrName);
    }
  }

  /**
   * Re-evaluate a single element cleanly (adds OR clears tags so Polymer DOM recycling is safe).
   */
  function evaluateElement(el, route) {
    if (!isElement(el) || isInsideIgnoredArea(el)) return;
    var tag = (el.tagName || '').toLowerCase();

    if (el.matches && el.matches(SELECTORS.GUIDE_ENTRY)) {
      var info = extractSidebarEntryInfo(el);
      if (!info) {
        if (el.hasAttribute('data-ytb-sidebar-key')) el.removeAttribute('data-ytb-sidebar-key');
        setBooleanAttr(el, 'data-ytb-shorts-tab-item', false);
        setBooleanAttr(el, 'data-ytb-trending-item', false);
        setBooleanAttr(el, 'data-ytb-premium-item', false);
        return null;
      }

      if (info.key === 'shorts') {
        setBooleanAttr(el, 'data-ytb-shorts-tab-item', true);
        if (el.hasAttribute('data-ytb-sidebar-key')) el.removeAttribute('data-ytb-sidebar-key');
      } else if (info.key === 'trending') {
        setBooleanAttr(el, 'data-ytb-trending-item', true);
        if (el.hasAttribute('data-ytb-sidebar-key')) el.removeAttribute('data-ytb-sidebar-key');
      } else if (info.key === 'premium') {
        setBooleanAttr(el, 'data-ytb-premium-item', true);
        if (el.hasAttribute('data-ytb-sidebar-key')) el.removeAttribute('data-ytb-sidebar-key');
      } else {
        setBooleanAttr(el, 'data-ytb-shorts-tab-item', false);
        setBooleanAttr(el, 'data-ytb-trending-item', false);
        setBooleanAttr(el, 'data-ytb-premium-item', false);
        if (!info.skipCatalog) {
          el.setAttribute('data-ytb-sidebar-key', info.key);
          return info;
        }
        if (el.hasAttribute('data-ytb-sidebar-key')) el.removeAttribute('data-ytb-sidebar-key');
      }
      return null;
    }

    if (el.matches && (el.matches(SELECTORS.CHANNEL_TAB) || el.matches(SELECTORS.FILTER_CHIP))) {
      setBooleanAttr(el, 'data-ytb-shorts-tab-item', isShortsTabElement(el));
      if (tag === 'yt-chip-cloud-chip-renderer') {
        setBooleanAttr(el, 'data-ytb-trending-item', isTrendingShelfOrChip(el));
      }
      return null;
    }

    if (el.matches && (el.matches(SELECTORS.PROMO) || tag === SELECTORS.DIALOG)) {
      if (tag === SELECTORS.DIALOG) {
        var upsell = el.querySelector('ytd-upsell-dialog-renderer');
        var isPremDialog = Boolean(upsell) || hasPremiumLink(el);
        setBooleanAttr(el, 'data-ytb-premium-item', isPremDialog);
      } else {
        setBooleanAttr(el, 'data-ytb-premium-item', isPremiumPromoElement(el));
      }
      return null;
    }

    if (el.matches && el.matches(SELECTORS.POST_CARD)) {
      setBooleanAttr(el, 'data-ytb-members-item', isMembersOnlyCard(el));
      return null;
    }

    if (el.matches && el.matches(SELECTORS.SHELF)) {
      var shelfContainer = el.closest('ytd-rich-section-renderer') || el;
      var inHome = route === 'home' || Boolean(shelfContainer.closest('ytd-browse[page-subtype="home"]'));
      var isShortsShelf = isShortsCardOrShelf(shelfContainer);

      setBooleanAttr(shelfContainer, 'data-ytb-home-shorts-item', inHome && isShortsShelf);
      setBooleanAttr(shelfContainer, 'data-ytb-feed-shorts-item', !inHome && isShortsShelf);
      setBooleanAttr(shelfContainer, 'data-ytb-trending-item', isTrendingShelfOrChip(shelfContainer));
      setBooleanAttr(shelfContainer, 'data-ytb-premium-item', isPremiumPromoElement(shelfContainer));
      setBooleanAttr(shelfContainer, 'data-ytb-members-item', isMembersOnlyShelf(shelfContainer));
      return null;
    }

    if (el.matches && el.matches(SELECTORS.VIDEO_CARD)) {
      var targetCard = getOutermostCard(el);
      var cardInHome = route === 'home' || Boolean(targetCard.closest('ytd-browse[page-subtype="home"]'));
      var cardIsShorts = isShortsCardOrShelf(targetCard);

      setBooleanAttr(targetCard, 'data-ytb-home-shorts-item', cardInHome && cardIsShorts);
      setBooleanAttr(targetCard, 'data-ytb-feed-shorts-item', !cardInHome && cardIsShorts);
      setBooleanAttr(targetCard, 'data-ytb-premium-item', isPremiumCard(targetCard));
      setBooleanAttr(targetCard, 'data-ytb-members-item', isMembersOnlyCard(targetCard));
      return null;
    }

    return null;
  }

  var selectorApi = {
    SELECTORS: SELECTORS,
    getRouteFromLocation: getRouteFromLocation,
    isInsideIgnoredArea: isInsideIgnoredArea,
    isMembersOnlyCard: isMembersOnlyCard,
    isMembersOnlyShelf: isMembersOnlyShelf,
    isPremiumPromoElement: isPremiumPromoElement,
    isPremiumCard: isPremiumCard,
    isShortsCardOrShelf: isShortsCardOrShelf,
    isShortsTabElement: isShortsTabElement,
    isTrendingShelfOrChip: isTrendingShelfOrChip,
    isSubscribedChannelEntry: isSubscribedChannelEntry,
    extractSidebarEntryInfo: extractSidebarEntryInfo,
    evaluateElement: evaluateElement
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = selectorApi;
  }
  root.YTB = Object.assign(root.YTB || {}, { selectors: selectorApi });
})(typeof globalThis !== 'undefined' ? globalThis : self);
