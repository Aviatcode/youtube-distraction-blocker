'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var YTB = require(path.join(ROOT, 'src/shared/defaults.js'));
var storageApi = require(path.join(ROOT, 'src/shared/storage.js'));
var selectors = require(path.join(ROOT, 'src/content/selectors.js'));
var domMock = require('./dom-mock.js');

global.YTB = Object.assign({}, YTB, { storage: storageApi, selectors: selectors });
global.MutationObserver = domMock.MockMutationObserver;
var controllerMod = require(path.join(ROOT, 'src/content/dom-observer.js'));

var passed = 0;
var failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('PASS:', name);
  } catch (err) {
    failed++;
    console.error('FAIL:', name);
    console.error(err && err.stack ? err.stack : err);
  }
}

function createMemoryStorage() {
  var store = Object.create(null);
  var writeCount = 0;
  return {
    get: function (keys, cb) {
      var res = {};
      var arr = Array.isArray(keys) ? keys : [keys];
      for (var i = 0; i < arr.length; i++) {
        if (Object.prototype.hasOwnProperty.call(store, arr[i])) {
          res[arr[i]] = JSON.parse(JSON.stringify(store[arr[i]]));
        }
      }
      cb(res);
    },
    set: function (obj, cb) {
      writeCount++;
      var keys = Object.keys(obj);
      for (var i = 0; i < keys.length; i++) {
        store[keys[i]] = JSON.parse(JSON.stringify(obj[keys[i]]));
      }
      if (cb) cb();
    },
    _dump: function () { return store; },
    _getWriteCount: function () { return writeCount; }
  };
}

function createMockWindow(pathname) {
  return {
    location: { pathname: pathname || '/' },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    requestAnimationFrame: null,
    cancelAnimationFrame: null
  };
}

async function runAll() {
  await test('Manifest V3 structure, permissions, domains, and asset paths', function () {
    var manifestPath = path.join(ROOT, 'manifest.json');
    var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.strictEqual(manifest.manifest_version, 3);
    assert.deepStrictEqual(manifest.permissions, ['storage', 'scripting']);
    assert.deepStrictEqual(manifest.host_permissions, ['https://www.youtube.com/*', 'https://m.youtube.com/*']);
    assert.ok(manifest.action && manifest.action.default_popup);
    assert.ok(manifest.background && manifest.background.service_worker);
    assert.ok(manifest.options_ui && manifest.options_ui.page);

    assert.strictEqual(manifest.content_scripts.length, 1);
    var cs = manifest.content_scripts[0];
    assert.strictEqual(cs.run_at, 'document_start');
    assert.ok(cs.matches.indexOf('https://www.youtube.com/*') !== -1);
    assert.ok(cs.matches.indexOf('https://m.youtube.com/*') !== -1);
    assert.ok(cs.exclude_matches.indexOf('https://www.youtube.com/embed/*') !== -1);
    assert.ok(cs.exclude_matches.indexOf('https://www.youtube.com/live_chat*') !== -1);

    var filesToCheck = []
      .concat(Object.values(manifest.icons))
      .concat(Object.values(manifest.action.default_icon))
      .concat([manifest.action.default_popup, manifest.options_ui.page, manifest.background.service_worker])
      .concat(cs.css, cs.js);

    for (var i = 0; i < filesToCheck.length; i++) {
      var full = path.join(ROOT, filesToCheck[i]);
      assert.ok(fs.existsSync(full), 'Missing referenced file: ' + filesToCheck[i]);
    }
  });

  await test('CSS syntax check: balanced braces in content.css, ui.css, popup.css, options.css', function () {
    var cssFiles = [
      'src/content/content.css',
      'src/shared/ui.css',
      'src/popup/popup.css',
      'src/options/options.css'
    ];
    for (var i = 0; i < cssFiles.length; i++) {
      var css = fs.readFileSync(path.join(ROOT, cssFiles[i]), 'utf8');
      var open = (css.match(/\{/g) || []).length;
      var close = (css.match(/\}/g) || []).length;
      assert.strictEqual(open, close, 'Unbalanced braces in ' + cssFiles[i]);
      assert.ok(open > 0, 'Empty CSS file: ' + cssFiles[i]);
    }
  });

  await test('Settings defaults and corrupt-data normalization', function () {
    var defaults = YTB.createDefaultSettings();
    assert.strictEqual(defaults.masterEnabled, true);
    assert.strictEqual(defaults.features.blockInfiniteScroll, true);
    assert.strictEqual(defaults.features.blockShortsTab, true);
    assert.strictEqual(defaults.features.blockHomepageShorts, true);
    assert.strictEqual(defaults.features.blockSubscriptionShorts, false);
    assert.strictEqual(defaults.features.blockTrending, true);
    assert.strictEqual(defaults.features.blockPremium, true);
    assert.strictEqual(defaults.features.blockMembersOnly, true);
    assert.strictEqual(defaults.features.blockPlayables, true);
    assert.deepStrictEqual(defaults.sidebarHidden, {});

    var normalized = YTB.normalizeSettings({
      masterEnabled: 'invalid',
      features: { blockShortsTab: false, unknownFlag: true },
      sidebarHidden: { gaming: true, invalid: 'yes', music: false }
    });
    assert.strictEqual(normalized.masterEnabled, true);
    assert.strictEqual(normalized.features.blockShortsTab, false);
    assert.strictEqual(normalized.features.blockTrending, true);
    assert.strictEqual(normalized.features.unknownFlag, undefined);
    assert.deepStrictEqual(normalized.sidebarHidden, { gaming: true });
  });

  await test('Storage layer: independent toggles, master switch preservation, restore defaults, sidebar discovery', async function () {
    var mem = createMemoryStorage();

    await storageApi.updateFeature('blockShortsTab', false, mem);
    await storageApi.setSidebarItemHidden('gaming', true, mem);
    await storageApi.setSidebarItemHidden('music', true, mem);

    var s1 = await storageApi.getSettings(mem);
    assert.strictEqual(s1.features.blockShortsTab, false);
    assert.strictEqual(s1.features.blockHomepageShorts, true);
    assert.deepStrictEqual(s1.sidebarHidden, { gaming: true, music: true });

    // Master switch OFF then ON must preserve individual toggles & sidebarHidden.
    await storageApi.setMasterEnabled(false, mem);
    var paused = await storageApi.getSettings(mem);
    assert.strictEqual(paused.masterEnabled, false);
    assert.strictEqual(paused.features.blockShortsTab, false);
    assert.strictEqual(paused.features.blockInfiniteScroll, true);
    assert.deepStrictEqual(paused.sidebarHidden, { gaming: true, music: true });

    await storageApi.setMasterEnabled(true, mem);
    var resumed = await storageApi.getSettings(mem);
    assert.strictEqual(resumed.masterEnabled, true);
    assert.strictEqual(resumed.features.blockShortsTab, false);
    assert.deepStrictEqual(resumed.sidebarHidden, { gaming: true, music: true });

    // Sidebar item untoggle doesn't affect sibling sidebar items.
    await storageApi.setSidebarItemHidden('gaming', false, mem);
    var s2 = await storageApi.getSettings(mem);
    assert.deepStrictEqual(s2.sidebarHidden, { music: true });

    // Discovered sidebar merging avoids redundant writes when identical.
    var wBefore = mem._getWriteCount();
    await storageApi.mergeDiscoveredSidebarItems([
      { key: 'gaming', label: 'Gaming', group: 'Explore' },
      { key: 'path_hype', label: 'Hype', group: 'Explore' },
      { key: 'shorts', label: 'Shorts', group: 'Main' } // excluded because dedicated
    ], mem);
    var wAfter1 = mem._getWriteCount();
    assert.strictEqual(wAfter1, wBefore + 1);

    await storageApi.mergeDiscoveredSidebarItems([
      { key: 'gaming', label: 'Gaming', group: 'Explore' },
      { key: 'path_hype', label: 'Hype', group: 'Explore' }
    ], mem);
    assert.strictEqual(mem._getWriteCount(), wAfter1, 'Expected zero write when discovered items unchanged');

    var discovered = await storageApi.getDiscoveredSidebarItems(mem);
    assert.strictEqual(discovered.length, 2);

    // Restore Defaults resets user settings cleanly without failing.
    var reset = await storageApi.restoreDefaults(mem);
    assert.strictEqual(reset.masterEnabled, true);
    assert.strictEqual(reset.features.blockShortsTab, true);
    assert.deepStrictEqual(reset.sidebarHidden, {});
  });

  await test('Sidebar entry resolution: canonical categories, studio vs your videos, dedicated exclusions, and dynamic items', function () {
    assert.strictEqual(YTB.resolveSidebarEntry({ href: '/shorts', label: 'Shorts' }).key, 'shorts');
    assert.strictEqual(YTB.resolveSidebarEntry({ href: '/shorts', label: 'Shorts' }).dedicated, true);
    assert.strictEqual(YTB.resolveSidebarEntry({ href: '/feed/trending', label: 'Trending' }).dedicated, true);
    assert.strictEqual(YTB.resolveSidebarEntry({ href: '/premium', label: 'YouTube Premium' }).dedicated, true);
    assert.strictEqual(YTB.resolveSidebarEntry({ href: '/playables', label: 'Playables' }).key, 'playables');
    assert.strictEqual(YTB.resolveSidebarEntry({ href: '/playables', label: 'Playables' }).dedicated, true);

    assert.strictEqual(YTB.resolveSidebarEntry({ href: 'https://www.youtubekids.com/', label: 'YouTube Kids' }).key, 'kids');
    assert.strictEqual(YTB.resolveSidebarEntry({ href: '/feed/storefront', label: 'Movies & TV' }).key, 'movies');
    assert.strictEqual(YTB.resolveSidebarEntry({ href: '/channel/UCYfdidRxbB8Qhf0Nx7ioOYw', label: 'News' }).key, 'news');
    assert.strictEqual(YTB.resolveSidebarEntry({ href: '/channel/UCEgdi0XIXXZ-qJOFPf4JSKw', label: 'Sports' }).key, 'sports');
    assert.strictEqual(YTB.resolveSidebarEntry({ href: '/gaming', label: 'Gaming' }).key, 'gaming');
    assert.strictEqual(YTB.resolveSidebarEntry({ href: '/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ', label: 'Music' }).key, 'music');
    assert.strictEqual(YTB.resolveSidebarEntry({ href: '/podcasts', label: 'Podcasts' }).key, 'podcasts');
    assert.strictEqual(YTB.resolveSidebarEntry({ href: '/channel/UC4R8DWoMoI7CAwX8_LjQHig', label: 'Live' }).key, 'live');
    assert.strictEqual(YTB.resolveSidebarEntry({ href: '/channel/UCkYQyvc_i9hXEo4xic9Hh2g', label: 'Shopping' }).key, 'shopping');

    // Distinguish YouTube Studio root vs Your videos channel studio link.
    assert.strictEqual(YTB.resolveSidebarEntry({ href: 'https://studio.youtube.com/', label: 'YouTube Studio' }).key, 'youtube_studio');
    var yourVideos = YTB.resolveSidebarEntry({ href: 'https://studio.youtube.com/channel/UC123/videos', label: 'Your videos' });
    assert.notStrictEqual(yourVideos.key, 'youtube_studio');
    assert.strictEqual(yourVideos.dedicated, false);

    // Dynamic unseen category fallback
    var dynamic = YTB.resolveSidebarEntry({ href: '/feed/new_beta', label: 'Beta Lab', sectionLabel: 'Explore' });
    assert.strictEqual(dynamic.key, 'path_feed_new_beta');
    assert.strictEqual(dynamic.group, 'Explore');

    // Show more ignored
    assert.strictEqual(YTB.resolveSidebarEntry({ href: '', label: 'Show more' }), null);
  });

  await test('DOM controller: Homepage Shorts, Shorts Tab, Trending, Premium & Members-only without false positives', function () {
    var doc = new domMock.MockDocument();
    var win = createMockWindow('/');
    var el = domMock.el;

    // Build mock YouTube Home DOM
    var homeBrowse = el(doc, 'ytd-browse', { 'page-subtype': 'home' }, [
      el(doc, 'ytd-rich-grid-renderer', {}, [
        el(doc, 'ytd-rich-section-renderer', {}, [
          el(doc, 'ytd-rich-shelf-renderer', { 'is-shorts': '' }, [
            el(doc, 'ytm-shorts-lockup-view-model', {}, [
              el(doc, 'a', { href: '/shorts/abc123' }, [], 'Funny short')
            ])
          ])
        ]),
        // Normal video whose title mentions "Premium" and "Members only" - MUST NOT BE HIDDEN!
        el(doc, 'ytd-rich-item-renderer', { id: 'normal-video' }, [
          el(doc, 'a', { href: '/watch?v=normal1', id: 'video-title' }, [], 'Premium Coffee Review & Members only Q&A recap')
        ]),
        // Members-only video with badge-shape
        el(doc, 'ytd-rich-item-renderer', { id: 'members-video' }, [
          el(doc, 'a', { href: '/watch?v=mem1', id: 'video-title' }, [], 'Behind the scenes'),
          el(doc, 'badge-shape', {}, [], 'Members only')
        ]),
        // Premium-badged video
        el(doc, 'ytd-rich-item-renderer', { id: 'premium-video' }, [
          el(doc, 'a', { href: '/watch?v=prem1', id: 'video-title' }, [], 'Originals Episode 1'),
          el(doc, 'badge-shape', {}, [], 'Included with Premium')
        ]),
        // Home continuation item
        el(doc, 'ytd-continuation-item-renderer', { id: 'home-cont' })
      ])
    ]);

    // Premium upsell dialog with close button
    var dismissBtn = el(doc, 'button', { 'aria-label': 'Close' }, [], 'No thanks');
    var upsellDialog = el(doc, 'tp-yt-paper-dialog', { id: 'upsell-dlg' }, [
      el(doc, 'ytd-upsell-dialog-renderer', {}, [
        el(doc, 'a', { href: '/premium' }, [], 'Get YouTube Premium'),
        dismissBtn
      ])
    ]);

    // Neutral watch history notice (NOT Premium!)
    var neutralPromo = el(doc, 'ytd-background-promo-renderer', { id: 'history-off' }, [
      el(doc, 'div', { id: 'promo-title' }, [], 'Your watch history is off')
    ]);

    // Community posts: 1 members-only, 1 public
    var memberPost = el(doc, 'ytd-backstage-post-thread-renderer', { id: 'mem-post' }, [
      el(doc, 'ytd-sponsors-only-badge-renderer', { id: 'sponsors-only-badge' }, [], 'Members only')
    ]);
    var publicPost = el(doc, 'ytd-backstage-post-thread-renderer', { id: 'pub-post' }, [
      el(doc, 'div', { id: 'content-text' }, [], 'Hello channel members and subscribers!')
    ]);

    // Ignored #movie_player mutation area
    var player = el(doc, 'div', { id: 'movie_player' }, [
      el(doc, 'badge-shape', { id: 'player-badge' }, [], 'Members only')
    ]);

    // Comments continuation MUST NOT be blocked
    var commentsCont = el(doc, 'ytd-continuation-item-renderer', { id: 'comments-cont' });
    var comments = el(doc, 'ytd-comments', { id: 'comments' }, [commentsCont]);

    doc.body.appendChild(homeBrowse);
    doc.body.appendChild(upsellDialog);
    doc.body.appendChild(neutralPromo);
    doc.body.appendChild(memberPost);
    doc.body.appendChild(publicPost);
    doc.body.appendChild(player);
    doc.body.appendChild(comments);

    var discoveredBatches = [];
    var ctrl = controllerMod.createController({
      document: doc,
      window: win,
      onSidebarDiscovered: function (b) { discoveredBatches.push(b); }
    });

    ctrl.init(YTB.createDefaultSettings());

    // Root flags set
    assert.strictEqual(doc.documentElement.getAttribute('data-ytb-enabled'), 'true');
    assert.strictEqual(doc.documentElement.getAttribute('data-ytb-route'), 'home');

    // Shorts shelf tagged on home
    var shortsShelf = doc.querySelector('ytd-rich-section-renderer');
    assert.strictEqual(shortsShelf.getAttribute('data-ytb-home-shorts-item'), 'true');

    // Normal video NOT tagged
    var normalVideo = doc.getElementById('normal-video');
    assert.strictEqual(normalVideo.hasAttribute('data-ytb-premium-item'), false);
    assert.strictEqual(normalVideo.hasAttribute('data-ytb-members-item'), false);
    assert.strictEqual(normalVideo.hasAttribute('data-ytb-home-shorts-item'), false);

    // Members video & Premium video tagged accurately
    assert.strictEqual(doc.getElementById('members-video').getAttribute('data-ytb-members-item'), 'true');
    assert.strictEqual(doc.getElementById('premium-video').getAttribute('data-ytb-premium-item'), 'true');

    // Upsell dialog dismissed safely once
    assert.strictEqual(upsellDialog.getAttribute('data-ytb-premium-item'), 'true');
    assert.strictEqual(dismissBtn.clickedCount, 1);

    // Neutral promo NOT tagged
    assert.strictEqual(neutralPromo.hasAttribute('data-ytb-premium-item'), false);

    // Posts: members-only hidden, public safe
    assert.strictEqual(memberPost.getAttribute('data-ytb-members-item'), 'true');
    assert.strictEqual(publicPost.hasAttribute('data-ytb-members-item'), false);

    // Movie player ignored
    assert.strictEqual(doc.getElementById('player-badge').hasAttribute('data-ytb-members-item'), false);

    // Infinite scroll paused on home continuation, NOT on comments continuation
    assert.strictEqual(doc.getElementById('home-cont').inert, true);
    assert.strictEqual(commentsCont.inert, false);
    assert.ok(doc.querySelector('.ytb-feed-end-note'), 'Expected end-of-feed note on Home');

    // Simulate Polymer recycling of members-video into a normal public video!
    var membersVideoEl = doc.getElementById('members-video');
    var badgeNode = membersVideoEl.querySelector('badge-shape');
    badgeNode.remove();
    membersVideoEl.appendChild(el(doc, 'span', {}, [], '10K views'));
    ctrl.flushPending();
    assert.strictEqual(membersVideoEl.hasAttribute('data-ytb-members-item'), false, 'Recycled card must clear stale members tag');

    // Turning Master Switch OFF flips root attr to false and clears dynamic sidebar CSS
    var settings = ctrl.getSettings();
    settings.masterEnabled = false;
    ctrl.applySettings(settings);
    assert.strictEqual(doc.documentElement.getAttribute('data-ytb-enabled'), 'false');
    assert.strictEqual(doc.getElementById('home-cont').inert, false);

    ctrl.destroy();
  });

  await test('DOM controller: Dynamic sidebar detection, empty section cleanup, Search manual pagination & Trending notice', async function () {
    var doc = new domMock.MockDocument();
    var win = createMockWindow('/results');
    var el = domMock.el;

    // Sidebar with Explore section + Subscriptions section (with creator avatar)
    var exploreSection = el(doc, 'ytd-guide-section-renderer', { id: 'explore-sec' }, [
      el(doc, 'h3', {}, [], 'Explore'),
      el(doc, 'ytd-guide-entry-renderer', { id: 'nav-trending' }, [
        el(doc, 'a', { id: 'endpoint', href: '/feed/trending', title: 'Trending' }, [
          el(doc, 'yt-formatted-string', { class: 'title' }, [], 'Trending')
        ])
      ]),
      el(doc, 'ytd-guide-entry-renderer', { id: 'nav-gaming' }, [
        el(doc, 'a', { id: 'endpoint', href: '/gaming', title: 'Gaming' }, [
          el(doc, 'yt-formatted-string', { class: 'title' }, [], 'Gaming')
        ])
      ]),
      el(doc, 'ytd-guide-entry-renderer', { id: 'nav-custom' }, [
        el(doc, 'a', { id: 'endpoint', href: '/courses', title: 'Courses' }, [
          el(doc, 'yt-formatted-string', { class: 'title' }, [], 'Courses')
        ])
      ])
    ]);

    var subsSection = el(doc, 'ytd-guide-section-renderer', { id: 'subs-sec' }, [
      el(doc, 'ytd-guide-entry-renderer', { id: 'sub-creator' }, [
        el(doc, 'a', { id: 'endpoint', href: '/@veritasium' }, [
          el(doc, 'yt-img-shadow', {}, [el(doc, 'img', { id: 'img' })]),
          el(doc, 'yt-formatted-string', { class: 'title' }, [], 'Veritasium')
        ])
      ])
    ]);

    // Search page with initial results + continuation
    var searchCont = el(doc, 'ytd-continuation-item-renderer', { id: 'search-cont' });
    var searchRoot = el(doc, 'ytd-search', {}, [
      el(doc, 'ytd-section-list-renderer', {}, [
        el(doc, 'div', { id: 'contents' }, [
          el(doc, 'ytd-item-section-renderer', {}, [
            el(doc, 'ytd-video-renderer', {}, [el(doc, 'a', { href: '/watch?v=s1' }, [], 'Search result 1')])
          ]),
          searchCont
        ])
      ])
    ]);

    doc.body.appendChild(exploreSection);
    doc.body.appendChild(subsSection);
    doc.body.appendChild(searchRoot);

    var discovered = [];
    var ctrl = controllerMod.createController({
      document: doc,
      window: win,
      onSidebarDiscovered: function (items) {
        discovered = discovered.concat(items);
      }
    });

    var settings = YTB.createDefaultSettings();
    settings.sidebarHidden = { gaming: true, learning: true };
    ctrl.init(settings);

    // Wait for buffered sidebar discovery flush (250ms)
    await new Promise(function (r) { setTimeout(r, 320); });

    // Trending tagged separately; Gaming & Courses tagged with sidebar keys; creator channel ignored
    assert.strictEqual(doc.getElementById('nav-trending').getAttribute('data-ytb-trending-item'), 'true');
    assert.strictEqual(doc.getElementById('nav-gaming').getAttribute('data-ytb-sidebar-key'), 'gaming');
    assert.strictEqual(doc.getElementById('nav-custom').getAttribute('data-ytb-sidebar-key'), 'learning');
    assert.strictEqual(doc.getElementById('sub-creator').hasAttribute('data-ytb-sidebar-key'), false);

    // Explore section now has all 3 entries hidden -> marked empty!
    assert.strictEqual(exploreSection.getAttribute('data-ytb-empty-section'), 'true');
    assert.strictEqual(subsSection.hasAttribute('data-ytb-empty-section'), false);

    // Dynamic CSS injected for gaming + learning
    var styleEl = doc.getElementById('ytb-sidebar-style');
    assert.ok(styleEl.textContent.indexOf('data-ytb-sidebar-key="gaming"') !== -1);
    assert.ok(styleEl.textContent.indexOf('data-ytb-sidebar-key="learning"') !== -1);

    // Discovered sidebar buffer captured gaming & learning (NOT trending or creator channel)
    var discoveredKeys = discovered.map(function (d) { return d.key; });
    assert.ok(discoveredKeys.indexOf('gaming') !== -1);
    assert.ok(discoveredKeys.indexOf('learning') !== -1);
    assert.strictEqual(discoveredKeys.indexOf('trending'), -1);

    // Unhiding gaming removes empty-section flag immediately
    settings.sidebarHidden = { learning: true };
    ctrl.applySettings(settings);
    assert.strictEqual(exploreSection.hasAttribute('data-ytb-empty-section'), false);

    // Search manual pagination button exists and enables single continuation load on click
    var loadBtn = doc.querySelector('.ytb-manual-load-btn');
    assert.ok(loadBtn, 'Expected manual pagination button on Search');
    assert.strictEqual(searchCont.inert, true);
    loadBtn.click();
    assert.strictEqual(searchCont.getAttribute('data-ytb-allow-continuation'), 'true');
    assert.strictEqual(searchCont.inert, false);

    // SPA navigation to /feed/trending injects blocked notice banner
    win.location.pathname = '/feed/trending';
    doc.body.appendChild(el(doc, 'ytd-browse', { 'page-subtype': 'trending' }));
    ctrl.handleNavigation();
    assert.strictEqual(doc.documentElement.getAttribute('data-ytb-route'), 'trending');
    assert.ok(doc.querySelector('.ytb-blocked-page-banner'));

    // Independent toggle test: disabling blockTrending removes banner without touching other flags
    settings.features.blockTrending = false;
    ctrl.applySettings(settings);
    assert.strictEqual(doc.documentElement.getAttribute('data-ytb-trending'), 'false');
    assert.strictEqual(doc.documentElement.getAttribute('data-ytb-infinite-scroll'), 'true');
    assert.strictEqual(doc.querySelector('.ytb-blocked-page-banner'), null);

    ctrl.destroy();
  });

  await test('DOM controller: Independent Shorts toggles (homepage vs sidebar tab vs subscriptions) and statement banner distinction', function () {
    var doc = new domMock.MockDocument();
    var win = createMockWindow('/feed/subscriptions');
    var el = domMock.el;

    var subShort = el(doc, 'ytd-rich-item-renderer', { id: 'sub-short' }, [
      el(doc, 'a', { href: '/shorts/s999' }, [], 'Creator Short')
    ]);
    var subShortsShelf = el(doc, 'ytd-rich-section-renderer', { id: 'sub-shorts-shelf' }, [
      el(doc, 'ytd-reel-shelf-renderer', {}, [
        el(doc, 'a', { href: '/shorts/s888' }, [], 'Shelf Short')
      ])
    ]);
    var subShortsChip = el(doc, 'yt-chip-cloud-chip-renderer', { id: 'sub-chip' }, [], 'Shorts');
    var subsBrowse = el(doc, 'ytd-browse', { 'page-subtype': 'subscriptions' }, [subShortsChip, subShortsShelf, subShort]);

    var homeShort = el(doc, 'ytd-rich-item-renderer', { id: 'home-short' }, [
      el(doc, 'a', { href: '/shorts/h111' }, [], 'Home Short')
    ]);
    var homeShortsChip = el(doc, 'yt-chip-cloud-chip-renderer', { id: 'home-chip' }, [], 'Shorts');
    var homeBrowse = el(doc, 'ytd-browse', { 'page-subtype': 'home' }, [homeShortsChip, homeShort]);

    var channelTab = el(doc, 'yt-tab-shape', { id: 'chan-shorts-tab', 'tab-title': 'Shorts' }, [], 'Shorts');
    var browseSection = el(doc, 'ytd-browse', { 'page-subtype': 'channels' }, [channelTab]);

    var searchShort = el(doc, 'ytd-video-renderer', { id: 'search-short' }, [
      el(doc, 'a', { href: '/shorts/q222' }, [], 'Search Short')
    ]);
    var searchShortsChip = el(doc, 'yt-chip-cloud-chip-renderer', { id: 'search-chip' }, [], 'Shorts');
    var searchSection = el(doc, 'ytd-search', {}, [searchShortsChip, searchShort]);

    var premBanner = el(doc, 'ytd-statement-banner-renderer', { id: 'prem-banner' }, [
      el(doc, 'a', { href: '/premium' }, [], 'Try YouTube Premium')
    ]);
    var infoBanner = el(doc, 'ytd-statement-banner-renderer', { id: 'info-banner' }, [
      el(doc, 'a', { href: '/creator-update' }, [], 'Creator community spotlight')
    ]);

    doc.body.appendChild(subsBrowse);
    doc.body.appendChild(homeBrowse);
    doc.body.appendChild(browseSection);
    doc.body.appendChild(searchSection);
    doc.body.appendChild(premBanner);
    doc.body.appendChild(infoBanner);

    var ctrl = controllerMod.createController({ document: doc, window: win });
    var settings = YTB.createDefaultSettings();
    ctrl.init(settings);

    // By default: Homepage Shorts ON, Sidebar Shorts tab ON, Subscriptions Shorts OFF (visible).
    assert.strictEqual(doc.documentElement.getAttribute('data-ytb-homepage-shorts'), 'true');
    assert.strictEqual(doc.documentElement.getAttribute('data-ytb-shorts-tab'), 'true');
    assert.strictEqual(doc.documentElement.getAttribute('data-ytb-subscription-shorts'), 'false');

    // Home short tagged as homepage-only; Sub short tagged as subscription-only (and NOT hidden while flag is false).
    assert.strictEqual(doc.getElementById('home-short').getAttribute('data-ytb-home-shorts-item'), 'true');
    assert.strictEqual(doc.getElementById('home-short').hasAttribute('data-ytb-subscription-shorts-item'), false);
    assert.strictEqual(doc.getElementById('sub-short').getAttribute('data-ytb-subscription-shorts-item'), 'true');
    assert.strictEqual(doc.getElementById('sub-short').hasAttribute('data-ytb-home-shorts-item'), false);
    assert.strictEqual(doc.getElementById('sub-shorts-shelf').getAttribute('data-ytb-subscription-shorts-item'), 'true');
    assert.strictEqual(doc.getElementById('sub-shorts-shelf').hasAttribute('data-ytb-home-shorts-item'), false);

    // Subscriptions Shorts chip and Search Shorts chip are preserved; Home chip & Channel Shorts tab are tagged.
    assert.strictEqual(doc.getElementById('chan-shorts-tab').getAttribute('data-ytb-shorts-tab-item'), 'true');
    assert.strictEqual(doc.getElementById('home-chip').getAttribute('data-ytb-shorts-tab-item'), 'true');
    assert.strictEqual(doc.getElementById('sub-chip').hasAttribute('data-ytb-shorts-tab-item'), false);
    assert.strictEqual(doc.getElementById('search-chip').hasAttribute('data-ytb-shorts-tab-item'), false);
    assert.strictEqual(doc.getElementById('search-short').hasAttribute('data-ytb-subscription-shorts-item'), false);

    // Enabling blockSubscriptionShorts flips data-ytb-subscription-shorts to true without touching other flags.
    settings.features.blockSubscriptionShorts = true;
    ctrl.applySettings(settings);
    assert.strictEqual(doc.documentElement.getAttribute('data-ytb-subscription-shorts'), 'true');
    assert.strictEqual(doc.documentElement.getAttribute('data-ytb-homepage-shorts'), 'true');

    // Premium banner tagged, neutral announcement banner untouched.
    assert.strictEqual(doc.getElementById('prem-banner').getAttribute('data-ytb-premium-item'), 'true');
    assert.strictEqual(doc.getElementById('info-banner').hasAttribute('data-ytb-premium-item'), false);

    ctrl.destroy();
  });

  await test('Playlist continuation preservation and dashboard sidebar list merging', function () {
    var doc = new domMock.MockDocument();
    var win = createMockWindow('/playlist');
    var el = domMock.el;

    var playlistCont = el(doc, 'ytd-continuation-item-renderer', { id: 'playlist-cont' });
    var playlistBrowse = el(doc, 'ytd-browse', { 'page-subtype': 'playlist' }, [
      el(doc, 'ytd-playlist-video-list-renderer', {}, [playlistCont])
    ]);
    doc.body.appendChild(playlistBrowse);

    var ctrl = controllerMod.createController({ document: doc, window: win });
    ctrl.init(YTB.createDefaultSettings());
    assert.strictEqual(playlistCont.inert, false, 'Long playlists must still load continuations');
    ctrl.destroy();

    // Test dashboardUI.mergeSidebarDisplayList deduplication & dynamic item inclusion
    global.document = doc;
    require(path.join(ROOT, 'src/shared/dashboard-ui.js'));
    var merged = global.YTB.dashboardUI.mergeSidebarDisplayList([
      { key: 'gaming', label: 'Gaming', group: 'Explore' },
      { key: 'path_hype', label: 'Hype', group: 'Explore' },
      { key: 'shorts', label: 'Shorts', group: 'Main' }
    ]);
    var gamingMatches = merged.filter(function (item) { return item.key === 'gaming'; });
    assert.strictEqual(gamingMatches.length, 1);
    assert.strictEqual(gamingMatches[0].detected, true);
    assert.ok(merged.some(function (item) { return item.key === 'path_hype' && item.detected === true; }));
    assert.strictEqual(merged.some(function (item) { return item.key === 'shorts'; }), false);
    assert.strictEqual(merged.some(function (item) { return item.key === 'playables'; }), false);
  });

  await test('DOM controller: YouTube Playables blocker (shelves, cards, sidebar, /playables route) without false positives', function () {
    var doc = new domMock.MockDocument();
    var win = createMockWindow('/');
    var el = domMock.el;

    var playablesSidebar = el(doc, 'ytd-guide-entry-renderer', { id: 'nav-playables' }, [
      el(doc, 'a', { id: 'endpoint', href: '/playables', title: 'Playables' }, [
        el(doc, 'yt-formatted-string', { class: 'title' }, [], 'Playables')
      ])
    ]);
    var exploreSec = el(doc, 'ytd-guide-section-renderer', { id: 'playables-explore' }, [playablesSidebar]);

    var playablesShelf = el(doc, 'ytd-rich-section-renderer', { id: 'playables-shelf' }, [
      el(doc, 'grid-shelf-view-model', {}, [
        el(doc, 'h2', {}, [], 'YouTube Playables'),
        el(doc, 'mini-game-card-view-model', {}, [
          el(doc, 'a', { href: '/playables/game123' }, [], 'Stack Bounce')
        ])
      ])
    ]);

    var homePlayablesChip = el(doc, 'yt-chip-cloud-chip-renderer', { id: 'home-playables-chip' }, [], 'Playables');
    var normalGamingVideo = el(doc, 'ytd-rich-item-renderer', { id: 'normal-gaming' }, [
      el(doc, 'a', { href: '/watch?v=game99', id: 'video-title' }, [], 'Trying YouTube Playables Review')
    ]);
    var homeBrowse = el(doc, 'ytd-browse', { 'page-subtype': 'home' }, [homePlayablesChip, playablesShelf, normalGamingVideo]);

    doc.body.appendChild(exploreSec);
    doc.body.appendChild(homeBrowse);

    var ctrl = controllerMod.createController({ document: doc, window: win });
    var settings = YTB.createDefaultSettings();
    ctrl.init(settings);

    assert.strictEqual(doc.documentElement.getAttribute('data-ytb-playables'), 'true');
    assert.strictEqual(playablesSidebar.getAttribute('data-ytb-playables-item'), 'true');
    assert.strictEqual(exploreSec.getAttribute('data-ytb-empty-section'), 'true');
    assert.strictEqual(playablesShelf.getAttribute('data-ytb-playables-item'), 'true');
    assert.strictEqual(homePlayablesChip.getAttribute('data-ytb-playables-item'), 'true');
    // Normal video mentioning "YouTube Playables" in title must NOT be hidden.
    assert.strictEqual(normalGamingVideo.hasAttribute('data-ytb-playables-item'), false);

    // Navigating to /playables shows blocked notice banner and toggling OFF removes it.
    win.location.pathname = '/playables';
    doc.body.appendChild(el(doc, 'ytd-browse', { 'page-subtype': 'playables' }));
    ctrl.handleNavigation();
    assert.strictEqual(doc.documentElement.getAttribute('data-ytb-route'), 'playables');
    assert.ok(doc.querySelector('.ytb-blocked-page-banner'));

    settings.features.blockPlayables = false;
    ctrl.applySettings(settings);
    assert.strictEqual(doc.documentElement.getAttribute('data-ytb-playables'), 'false');
    assert.strictEqual(exploreSec.hasAttribute('data-ytb-empty-section'), false);
    assert.strictEqual(doc.querySelector('.ytb-blocked-page-banner'), null);

    ctrl.destroy();
  });

  await test('Multi-tab controller sync and bfcache pause/resume lifecycle', function () {
    var el = domMock.el;

    // Tab 1: YouTube Home
    var doc1 = new domMock.MockDocument();
    var win1 = createMockWindow('/');
    var homeShort = el(doc1, 'ytd-rich-item-renderer', { id: 't1-short' }, [
      el(doc1, 'a', { href: '/shorts/s1' }, [], 'Short 1')
    ]);
    doc1.body.appendChild(el(doc1, 'ytd-browse', { 'page-subtype': 'home' }, [homeShort]));

    // Tab 2: YouTube Subscriptions (opened in background while paused)
    var doc2 = new domMock.MockDocument();
    var win2 = createMockWindow('/feed/subscriptions');
    var subMemCard = el(doc2, 'ytd-rich-item-renderer', { id: 't2-mem' }, [
      el(doc2, 'badge-shape', {}, [], 'Members only')
    ]);
    var subBrowse = el(doc2, 'ytd-browse', { 'page-subtype': 'subscriptions' }, [subMemCard]);
    doc2.body.appendChild(subBrowse);

    var ctrl1 = controllerMod.createController({ document: doc1, window: win1 });
    var ctrl2 = controllerMod.createController({ document: doc2, window: win2 });

    var pausedSettings = YTB.createDefaultSettings();
    pausedSettings.masterEnabled = false;
    ctrl1.init(pausedSettings);
    ctrl2.init(pausedSettings);

    // While paused, cards are skipped and root attr is false across both tabs.
    assert.strictEqual(doc1.documentElement.getAttribute('data-ytb-enabled'), 'false');
    assert.strictEqual(doc2.documentElement.getAttribute('data-ytb-enabled'), 'false');
    assert.strictEqual(subMemCard.hasAttribute('data-ytb-members-item'), false);

    // Master switch turned ON -> both tabs apply settings and Tab 2 scans previously skipped card.
    var activeSettings = YTB.createDefaultSettings();
    ctrl1.applySettings(activeSettings);
    ctrl2.applySettings(activeSettings);
    assert.strictEqual(doc1.documentElement.getAttribute('data-ytb-enabled'), 'true');
    assert.strictEqual(doc2.documentElement.getAttribute('data-ytb-enabled'), 'true');
    assert.strictEqual(homeShort.getAttribute('data-ytb-home-shorts-item'), 'true');
    assert.strictEqual(subMemCard.getAttribute('data-ytb-members-item'), 'true');

    // Simulate bfcache pause() + resume() on Tab 2 and verify new mutations still get observed.
    ctrl2.pause();
    ctrl2.resume();
    var lateCard = el(doc2, 'ytd-rich-item-renderer', { id: 't2-late-playables' }, [
      el(doc2, 'mini-game-card-view-model', {}, [], 'Playable')
    ]);
    subBrowse.appendChild(lateCard);
    ctrl2.flushPending();
    assert.strictEqual(lateCard.getAttribute('data-ytb-playables-item'), 'true');

    ctrl1.destroy();
    ctrl2.destroy();
  });

  console.log('\nSummary: ' + passed + ' passed, ' + failed + ' failed.');
  if (failed > 0) process.exit(1);
}

runAll();
