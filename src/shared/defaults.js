(function (root) {
  'use strict';

  var STORAGE_KEYS = Object.freeze({
    SETTINGS: 'ytbSettings',
    SIDEBAR_DISCOVERED: 'ytbDiscoveredSidebar'
  });

  var FEATURE_GROUPS = Object.freeze([
    { id: 'feed', title: 'Feed' },
    { id: 'shorts', title: 'Shorts' },
    { id: 'restrictions', title: 'Content Restrictions' }
  ]);

  var FEATURE_DEFINITIONS = Object.freeze([
    {
      id: 'blockInfiniteScroll',
      group: 'feed',
      label: 'Infinite scroll blocker',
      description: 'Stop automatic loading of endless feed batches on Home, Search, and recommendations.',
      defaultValue: true
    },
    {
      id: 'blockHomepageShorts',
      group: 'shorts',
      label: 'Hide Shorts on homepage',
      description: 'Remove Shorts shelves, grids, and Shorts cards from the YouTube homepage.',
      defaultValue: true
    },
    {
      id: 'blockShortsTab',
      group: 'shorts',
      label: 'Hide Shorts tab in sidebar',
      description: 'Hide the Shorts button and tabs in the left sidebar, mini-guide, and channel tabs.',
      defaultValue: true
    },
    {
      id: 'blockSubscriptionShorts',
      group: 'shorts',
      label: 'Hide Shorts in subscriptions',
      description: 'Hide Shorts shelves and Shorts videos in your Subscriptions feed (OFF by default so they stay visible).',
      defaultValue: false
    },
    {
      id: 'blockTrending',
      group: 'restrictions',
      label: 'Trending content',
      description: 'Hide Trending navigation links, Trending shelves, and Trending pages.',
      defaultValue: true
    },
    {
      id: 'blockPremium',
      group: 'restrictions',
      label: 'YouTube Premium promos',
      description: 'Hide Premium upsell banners, dialogs, sidebar promos, and Premium-badged promo shelves.',
      defaultValue: true
    },
    {
      id: 'blockMembersOnly',
      group: 'restrictions',
      label: 'Members-only content',
      description: 'Hide videos, posts, and shelves marked Members-only or Join-exclusive.',
      defaultValue: true
    },
    {
      id: 'blockPlayables',
      group: 'restrictions',
      label: 'YouTube Playables',
      description: 'Hide Playables mini-games, homepage shelves, sidebar links, and Playables pages.',
      defaultValue: true
    }
  ]);

  // Known sidebar navigation entries & Explore categories so toggles work before
  // and across dynamic YouTube account discovery, including localized accounts.
  var SIDEBAR_CATALOG = Object.freeze([
    {
      key: 'kids',
      label: 'YouTube Kids',
      group: 'Services',
      aliases: ['kids', 'youtube kids'],
      urlPatterns: ['youtubekids.com'],
      channelIds: []
    },
    {
      key: 'movies',
      label: 'Movies & TV',
      group: 'Explore',
      aliases: ['movies', 'movies & tv', 'films', 'films & tv', 'movies & shows'],
      urlPatterns: ['/feed/storefront'],
      channelIds: []
    },
    {
      key: 'news',
      label: 'News',
      group: 'Explore',
      aliases: ['news'],
      urlPatterns: ['/news'],
      channelIds: ['UCYfdidRxbB8Qhf0Nx7ioOYw']
    },
    {
      key: 'sports',
      label: 'Sports',
      group: 'Explore',
      aliases: ['sports'],
      urlPatterns: ['/sports'],
      channelIds: ['UCEgdi0XIXXZ-qJOFPf4JSKw']
    },
    {
      key: 'gaming',
      label: 'Gaming',
      group: 'Explore',
      aliases: ['gaming'],
      urlPatterns: ['/gaming'],
      channelIds: []
    },
    {
      key: 'music',
      label: 'Music',
      group: 'Explore',
      aliases: ['music'],
      urlPatterns: ['/music'],
      channelIds: ['UC-9-kyTW8ZkZNDHQJ6FgpwQ']
    },
    {
      key: 'podcasts',
      label: 'Podcasts',
      group: 'Explore',
      aliases: ['podcasts'],
      urlPatterns: ['/podcasts'],
      channelIds: []
    },
    {
      key: 'live',
      label: 'Live',
      group: 'Explore',
      aliases: ['live'],
      urlPatterns: ['/live'],
      channelIds: ['UC4R8DWoMoI7CAwX8_LjQHig']
    },
    {
      key: 'shopping',
      label: 'Shopping',
      group: 'Explore',
      aliases: ['shopping'],
      urlPatterns: ['/shopping'],
      channelIds: ['UCkYQyvc_i9hXEo4xic9Hh2g']
    },
    {
      key: 'learning',
      label: 'Courses / Learning',
      group: 'Explore',
      aliases: ['learning', 'courses'],
      urlPatterns: ['/feed/courses', '/learning'],
      channelIds: ['UCtFRv9O2AHqOZjjynzrv-xg']
    },
    {
      key: 'fashion',
      label: 'Fashion & Beauty',
      group: 'Explore',
      aliases: ['fashion & beauty', 'fashion'],
      urlPatterns: [],
      channelIds: ['UCrpQ4p1Ql_hG8rKXIKM1MOQ']
    },
    {
      key: 'youtube_music',
      label: 'YouTube Music',
      group: 'Services',
      aliases: ['youtube music'],
      urlPatterns: ['music.youtube.com'],
      channelIds: []
    },
    {
      key: 'youtube_studio',
      label: 'YouTube Studio',
      group: 'Services',
      aliases: ['youtube studio'],
      urlPatterns: ['studio.youtube.com'],
      channelIds: []
    },
    {
      key: 'youtube_tv',
      label: 'YouTube TV',
      group: 'Services',
      aliases: ['youtube tv'],
      urlPatterns: ['tv.youtube.com'],
      channelIds: []
    },
    {
      key: 'subscriptions',
      label: 'Subscriptions',
      group: 'Navigation',
      aliases: ['subscriptions'],
      urlPatterns: ['/feed/subscriptions'],
      channelIds: []
    },
    {
      key: 'you',
      label: 'You / Library',
      group: 'Navigation',
      aliases: ['you', 'library'],
      urlPatterns: ['/feed/you', '/feed/library'],
      channelIds: []
    },
    {
      key: 'history',
      label: 'History',
      group: 'Navigation',
      aliases: ['history'],
      urlPatterns: ['/feed/history'],
      channelIds: []
    },
    {
      key: 'playlists',
      label: 'Playlists',
      group: 'Navigation',
      aliases: ['playlists'],
      urlPatterns: ['/feed/playlists'],
      channelIds: []
    },
    {
      key: 'watch_later',
      label: 'Watch later',
      group: 'Navigation',
      aliases: ['watch later'],
      urlPatterns: ['list=WL'],
      channelIds: []
    },
    {
      key: 'liked_videos',
      label: 'Liked videos',
      group: 'Navigation',
      aliases: ['liked videos'],
      urlPatterns: ['list=LL'],
      channelIds: []
    },
    {
      key: 'downloads',
      label: 'Downloads',
      group: 'Navigation',
      aliases: ['downloads'],
      urlPatterns: ['/feed/downloads'],
      channelIds: []
    },
    {
      key: 'your_clips',
      label: 'Your clips',
      group: 'Navigation',
      aliases: ['your clips'],
      urlPatterns: ['/feed/clips'],
      channelIds: []
    }
  ]);

  // Sidebar items handled by dedicated top-level blockers instead of the generic sidebar list.
  var DEDICATED_SIDEBAR_KEYS = Object.freeze({
    shorts: true,
    trending: true,
    premium: true,
    playables: true
  });

  function createDefaultSettings() {
    var features = {};
    for (var i = 0; i < FEATURE_DEFINITIONS.length; i++) {
      var def = FEATURE_DEFINITIONS[i];
      features[def.id] = def.defaultValue;
    }
    return {
      masterEnabled: true,
      features: features,
      sidebarHidden: {}
    };
  }

  /**
   * Merge raw stored object with current defaults, ignoring corrupt fields.
   */
  function normalizeSettings(raw) {
    var defaults = createDefaultSettings();
    if (!raw || typeof raw !== 'object') {
      return defaults;
    }

    var masterEnabled = typeof raw.masterEnabled === 'boolean'
      ? raw.masterEnabled
      : defaults.masterEnabled;

    var features = {};
    var rawFeatures = (raw.features && typeof raw.features === 'object') ? raw.features : {};
    for (var i = 0; i < FEATURE_DEFINITIONS.length; i++) {
      var id = FEATURE_DEFINITIONS[i].id;
      features[id] = typeof rawFeatures[id] === 'boolean'
        ? rawFeatures[id]
        : defaults.features[id];
    }

    var sidebarHidden = {};
    if (raw.sidebarHidden && typeof raw.sidebarHidden === 'object') {
      var keys = Object.keys(raw.sidebarHidden);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        if (typeof key === 'string' && key && raw.sidebarHidden[key] === true) {
          sidebarHidden[key] = true;
        }
      }
    }

    return {
      masterEnabled: masterEnabled,
      features: features,
      sidebarHidden: sidebarHidden
    };
  }

  function slugifyLabel(label) {
    return String(label || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Determine if a sidebar entry maps to a dedicated feature (Shorts, Trending, Premium)
   * or a generic customizable sidebar key. Returns null when the item should be ignored
   * (e.g. "Show more", empty items, or Home).
   */
  function resolveSidebarEntry(info) {
    var href = String((info && info.href) || '').trim();
    var label = String((info && info.label) || '').trim();
    var sectionLabel = String((info && info.sectionLabel) || '').trim();
    var lowerLabel = label.toLowerCase();
    var lowerHref = href.toLowerCase();

    if (!label && !href) {
      return null;
    }

    // Ignore Home root and guide expand/collapse buttons.
    if (lowerHref === '/' || lowerHref === 'https://www.youtube.com/' || lowerHref === 'https://m.youtube.com/') {
      return { key: 'home', label: label || 'Home', dedicated: false, skipCatalog: true };
    }
    if (lowerLabel === 'show more' || lowerLabel === 'show fewer' || lowerLabel === 'show less') {
      return null;
    }

    // Identify dedicated top-level entries first.
    if (
      lowerHref === '/shorts' ||
      lowerHref.indexOf('/shorts?') === 0 ||
      lowerHref.indexOf('/shorts/') === 0 ||
      lowerHref.indexOf('youtube.com/shorts') !== -1 ||
      lowerLabel === 'shorts'
    ) {
      return { key: 'shorts', label: label || 'Shorts', dedicated: true };
    }

    if (
      lowerHref.indexOf('/feed/trending') === 0 ||
      lowerHref === '/feed/explore' ||
      lowerHref.indexOf('/feed/explore?') === 0 ||
      lowerHref.indexOf('youtube.com/feed/trending') !== -1 ||
      lowerLabel === 'trending'
    ) {
      return { key: 'trending', label: label || 'Trending', dedicated: true };
    }

    if (
      lowerHref === '/premium' ||
      lowerHref.indexOf('/premium?') === 0 ||
      lowerHref.indexOf('youtube.com/premium') !== -1 ||
      lowerLabel === 'youtube premium' ||
      lowerLabel === 'get youtube premium'
    ) {
      return { key: 'premium', label: label || 'YouTube Premium', dedicated: true };
    }

    if (
      lowerHref === '/playables' ||
      lowerHref.indexOf('/playables?') === 0 ||
      lowerHref.indexOf('/playables/') === 0 ||
      lowerHref.indexOf('youtube.com/playables') !== -1 ||
      lowerLabel === 'playables' ||
      lowerLabel === 'youtube playables'
    ) {
      return { key: 'playables', label: label || 'Playables', dedicated: true };
    }

    // Match against known canonical catalog (URL patterns, channel IDs, then label aliases).
    for (var i = 0; i < SIDEBAR_CATALOG.length; i++) {
      var item = SIDEBAR_CATALOG[i];
      for (var c = 0; c < item.channelIds.length; c++) {
        if (href.indexOf(item.channelIds[c]) !== -1) {
          return { key: item.key, label: label || item.label, group: item.group, dedicated: false };
        }
      }
      for (var u = 0; u < item.urlPatterns.length; u++) {
        if (lowerHref.indexOf(item.urlPatterns[u].toLowerCase()) !== -1) {
          // "Your videos" links to studio.youtube.com/channel/... while "YouTube Studio" is the studio root.
          if (item.key === 'youtube_studio' && lowerHref.indexOf('/channel/') !== -1) {
            continue;
          }
          return { key: item.key, label: label || item.label, group: item.group, dedicated: false };
        }
      }
    }

    for (var j = 0; j < SIDEBAR_CATALOG.length; j++) {
      var aliasItem = SIDEBAR_CATALOG[j];
      for (var a = 0; a < aliasItem.aliases.length; a++) {
        if (lowerLabel === aliasItem.aliases[a]) {
          return { key: aliasItem.key, label: label || aliasItem.label, group: aliasItem.group, dedicated: false };
        }
      }
    }

    // Dynamic fallback key for any other account-specific or newly added YouTube sidebar item.
    var fallbackKey = '';
    if (href) {
      try {
        var parsed = new URL(href, 'https://www.youtube.com');
        var listParam = parsed.searchParams.get('list');
        var pathPart = parsed.pathname.replace(/\/+$/, '') || '/';
        if (parsed.hostname && parsed.hostname !== 'www.youtube.com' && parsed.hostname !== 'm.youtube.com') {
          fallbackKey = 'ext_' + slugifyLabel(parsed.hostname + '_' + (label || pathPart));
        } else if (listParam) {
          fallbackKey = 'path_' + slugifyLabel(pathPart + '_list_' + listParam);
        } else if (pathPart !== '/') {
          fallbackKey = 'path_' + slugifyLabel(pathPart);
        }
      } catch (_) {
        fallbackKey = '';
      }
    }
    if (!fallbackKey) {
      var slug = slugifyLabel(label);
      if (!slug) {
        return null;
      }
      fallbackKey = 'label_' + slug;
    }

    if (DEDICATED_SIDEBAR_KEYS[fallbackKey]) {
      return { key: fallbackKey, label: label, dedicated: true };
    }

    return {
      key: fallbackKey,
      label: label || fallbackKey,
      group: sectionLabel || 'Other',
      dedicated: false
    };
  }

  function sanitizeDiscoveredSidebarItems(rawList) {
    if (!Array.isArray(rawList)) {
      return [];
    }
    var seen = Object.create(null);
    var cleaned = [];
    for (var i = 0; i < rawList.length; i++) {
      var entry = rawList[i];
      if (!entry || typeof entry !== 'object') continue;
      var key = typeof entry.key === 'string' ? entry.key.trim() : '';
      var label = typeof entry.label === 'string' ? entry.label.trim() : '';
      if (!key || !label || DEDICATED_SIDEBAR_KEYS[key] || key === 'home') continue;
      if (seen[key]) continue;
      seen[key] = true;
      cleaned.push({
        key: key,
        label: label,
        group: typeof entry.group === 'string' && entry.group.trim() ? entry.group.trim() : 'Detected'
      });
    }
    return cleaned.slice(0, 60);
  }

  var api = {
    STORAGE_KEYS: STORAGE_KEYS,
    FEATURE_GROUPS: FEATURE_GROUPS,
    FEATURE_DEFINITIONS: FEATURE_DEFINITIONS,
    SIDEBAR_CATALOG: SIDEBAR_CATALOG,
    DEDICATED_SIDEBAR_KEYS: DEDICATED_SIDEBAR_KEYS,
    createDefaultSettings: createDefaultSettings,
    normalizeSettings: normalizeSettings,
    resolveSidebarEntry: resolveSidebarEntry,
    sanitizeDiscoveredSidebarItems: sanitizeDiscoveredSidebarItems
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.YTB = Object.assign(root.YTB || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : self);
