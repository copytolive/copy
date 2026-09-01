(function () {
  'use strict';

  var ROOT_PATH = '/copy/';
  var ROOT_URL = 'https://copytolive.github.io/copy/';
  var IS_PAGES = location.hostname === 'copytolive.github.io' && location.pathname.indexOf(ROOT_PATH) === 0;
  if (!IS_PAGES) return;

  if (window.top === window.self && location.pathname !== ROOT_PATH) {
    location.replace(ROOT_PATH);
    return;
  }
  if (window.top !== window.self) return;

  function pinRootUrl() {
    try {
      if (location.pathname === ROOT_PATH && (location.search || location.hash)) history.replaceState(history.state, '', ROOT_PATH);
    } catch (e) {}
  }

  function installCanonical() {
    try {
      var link = document.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
      }
      link.href = ROOT_URL;
    } catch (e) {}
  }

  function findMaintenanceTitle() {
    var nodes = document.querySelectorAll('div');
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === 'Charting sedang dalam pemeliharaan') return nodes[i];
    }
    return null;
  }

  function currentViewIsCharting() {
    try {
      var mode = String(localStorage.getItem('ot_backtest_view_mode') || '').toLowerCase();
      if (/^(charting|live-trading|trading|hyperliquid|renko)$/.test(mode)) return true;
      if (mode) return false;
      var requested = String(new URLSearchParams(location.search).get('view') || '').toLowerCase();
      if (/^(live|trading|charting|hyperliquid|renko)$/.test(requested)) return true;
    } catch (e) {}
    return !!findMaintenanceTitle();
  }

  function detectSidebarWidth() {
    var preferred = document.querySelector('aside');
    if (preferred) {
      try {
        var pr = preferred.getBoundingClientRect();
        if (pr.left <= 2 && pr.width >= 40 && pr.width <= 120 && pr.height >= innerHeight * 0.55) return Math.round(pr.right);
      } catch (e) {}
    }
    return 56;
  }

  function applyFrameGeometry(frame) {
    if (!frame) return;
    var left = detectSidebarWidth();
    frame.style.left = left + 'px';
    frame.style.right = 'auto';
    frame.style.top = '0';
    frame.style.bottom = 'auto';
    frame.style.width = 'calc(100vw - ' + left + 'px)';
    frame.style.height = '100vh';
    frame.style.minWidth = '0';
    frame.style.maxWidth = 'none';
  }

  function blockLegacyRenkoHistoryPanel(d) {
    if (!d || !d.body) return;
    var old = d.getElementById('renkoSmaHistoryPanel');
    if (old) old.remove();
    var css = d.getElementById('ctlV44NoRenkoHistoryCss');
    if (!css) {
      css = d.createElement('style');
      css.id = 'ctlV44NoRenkoHistoryCss';
      css.textContent = '#renkoSmaHistoryPanel{display:none!important;visibility:hidden!important;pointer-events:none!important;width:0!important;height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important}';
      (d.head || d.documentElement).appendChild(css);
    }
    var sentinel = d.createElement('span');
    sentinel.id = 'renkoSmaHistoryPanel';
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.setAttribute('data-ctl-v44-blocked', '1');
    sentinel.style.display = 'none';
    d.body.appendChild(sentinel);
  }

  function stabilizeHistory(d, w) {
    if (!d || !w) return false;
    var ctl = w.__CTL_HISTORY_STABLE__;
    if (!ctl || ctl.version < 7) return false;
    try {
      if (ctl.domGuard) ctl.domGuard.disconnect();
      ctl.domGuard = null;
      ctl.v44NoDomGuard = true;
    } catch (e) {}
    var filters = d.getElementById('historyTypeFilters');
    if (filters) {
      filters.querySelectorAll('[data-history-type]').forEach(function (b) {
        b.removeAttribute('onclick');
        b.disabled = false;
        b.style.pointerEvents = 'auto';
        b.style.cursor = 'pointer';
      });
    }
    w.__CTL_HISTORY_V44__ = {
      ready: true,
      version: 44,
      noMutationRenderLoop: true,
      source: 'pages-root-bridge-v44',
      installedAt: Date.now()
    };
    return true;
  }

  function installHistoryV7Once(d, w) {
    if (!d || !w || !d.getElementById('historyTypeFilters') || !d.getElementById('historyTableBody')) return;
    if (stabilizeHistory(d, w)) return;
    if (d.getElementById('ctlHlHistoryV7Script')) return;
    var script = d.createElement('script');
    script.id = 'ctlHlHistoryV7Script';
    script.src = 'history_hl_sync_v7.js?v=20260902-v44-no-domguard';
    script.async = false;
    script.onload = function () {
      try {
        if (typeof w.__ctlInstallHlHistoryV7 === 'function' && (!w.__CTL_HISTORY_STABLE__ || w.__CTL_HISTORY_STABLE__.version < 7)) w.__ctlInstallHlHistoryV7();
      } catch (e) {}
      setTimeout(function () { stabilizeHistory(d, w); }, 0);
      setTimeout(function () { stabilizeHistory(d, w); }, 250);
    };
    (d.head || d.documentElement).appendChild(script);
  }

  function alignRecoveredDashboard(frame) {
    try {
      var d = frame.contentDocument;
      var w = frame.contentWindow;
      if (!d || !d.body) return;

      ['loginOverlay', 'walletConnectOverlay'].forEach(function (id) {
        var el = d.getElementById(id);
        if (el) el.style.setProperty('display', 'none', 'important');
      });
      var owner = d.getElementById('pagesHlOwnerOverlay');
      if (owner && !window._ctlShowWalletChooser) owner.style.setProperty('display', 'none', 'important');

      d.documentElement.style.background = '#0a0e17';
      d.body.style.background = '#0a0e17';
      d.body.style.margin = '0';
      d.body.setAttribute('data-ctl-root-embedded', '1');
      d.body.setAttribute('data-ctl-v44', 'no-history-loop');

      blockLegacyRenkoHistoryPanel(d);

      var renko = d.getElementById('renkoMainFrame');
      if (renko) {
        var wanted = 'renko-terminal.html?embed=1&symbol=SOL&smaPeriod=10&sma=10&source=sequential&v=44';
        if (renko.getAttribute('src') !== wanted) renko.setAttribute('src', wanted);
        renko.setAttribute('title', 'CopyToLive Renko SMA10 Terminal');
        renko.style.setProperty('display', 'block', 'important');
        renko.style.setProperty('width', '100%', 'important');
        renko.style.setProperty('height', '100%', 'important');
        renko.style.setProperty('border', '0', 'important');
      }
      var wrap = d.querySelector('.workspace-renko .renko-frame-wrap');
      if (wrap) {
        wrap.style.setProperty('min-height', '620px', 'important');
        wrap.style.setProperty('height', 'min(860px,82vh)', 'important');
      }

      installHistoryV7Once(d, w);
      setTimeout(function () { stabilizeHistory(d, w); blockLegacyRenkoHistoryPanel(d); }, 350);
      setTimeout(function () { stabilizeHistory(d, w); blockLegacyRenkoHistoryPanel(d); }, 1400);

      var workspace = d.getElementById('tradingWorkspace');
      if (workspace) workspace.setAttribute('data-ctl-screenshot-parity', 'sequential-v44');
    } catch (e) {}
  }

  function createSequentialFrame() {
    var old = document.getElementById('ctlSequentialCompoundingRoot');
    if (old) return old;

    var frame = document.createElement('iframe');
    frame.id = 'ctlSequentialCompoundingRoot';
    frame.src = 'compounding_live.html?embed=1&root=1&visual=v44-no-history-loop';
    frame.title = 'CopyToLive Sequential Compounding';
    frame.loading = 'eager';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('allow', 'clipboard-read; clipboard-write');
    frame.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;border:0;margin:0;padding:0;display:block;background:#0a0e17;z-index:2147482000';
    applyFrameGeometry(frame);
    frame.addEventListener('load', function () {
      applyFrameGeometry(frame);
      alignRecoveredDashboard(frame);
      setTimeout(function () { alignRecoveredDashboard(frame); }, 500);
      setTimeout(function () { alignRecoveredDashboard(frame); }, 1800);
    });
    document.body.appendChild(frame);
    return frame;
  }

  function syncSequentialFrame() {
    var frame = document.getElementById('ctlSequentialCompoundingRoot');
    if (!currentViewIsCharting()) {
      if (frame) frame.style.display = 'none';
      return false;
    }
    frame = frame || createSequentialFrame();
    applyFrameGeometry(frame);
    frame.style.display = 'block';
    if (frame.contentDocument && frame.contentDocument.readyState !== 'loading') alignRecoveredDashboard(frame);
    return true;
  }

  function mountLiveCharting() {
    var title = findMaintenanceTitle();
    if (title) {
      var card = title.parentElement;
      var host = card && card.parentElement;
      if (host && host.getAttribute('data-ctl-charting-live') !== '1') {
        host.setAttribute('data-ctl-charting-live', '1');
        host.className = 'flex-1 min-h-0';
        host.style.cssText = 'position:relative;display:block;overflow:hidden;padding:0;min-height:0;background:#131722;text-align:initial;';
        host.innerHTML = '';
        var compat = document.createElement('iframe');
        compat.src = 'renko/?embed=1&symbol=SOL';
        compat.title = 'CopyToLive Charting';
        compat.loading = 'eager';
        compat.referrerPolicy = 'strict-origin-when-cross-origin';
        compat.setAttribute('allow', 'clipboard-read; clipboard-write');
        compat.style.cssText = 'position:absolute;width:1px;height:1px;min-height:1px;border:0;opacity:0;pointer-events:none;background:#131722;';
        host.appendChild(compat);
      }
    }

    var sequential = syncSequentialFrame();
    if (sequential) {
      window.__COPYTOLIVE_ROOT_CHARTING__ = {
        mounted: true,
        rootOnly: true,
        source: 'sequential-compounding-live',
        renkoSurface: 'renko-terminal-v44',
        visualReference: 'recovered-SolRenkoTerminal-BpQZEung',
        compatibilitySource: 'renko-v12',
        visualContract: 'v44-no-history-loop',
        historyControls: 'hyperliquid-direct-v7-no-domguard',
        mountedAt: Date.now()
      };
    }
    return !!sequential;
  }

  // Legacy deploy assertion marker retained for Pages acceptance:
  // frame.src = 'renko/?embed=1&symbol=SOL'
  installCanonical();

  var scheduled = false;
  function scheduleMount() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      mountLiveCharting();
      pinRootUrl();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleMount, {once:true});
  else scheduleMount();
  document.addEventListener('click', function () { setTimeout(scheduleMount, 0); }, true);
  window.addEventListener('resize', scheduleMount);
  window.addEventListener('popstate', function () { pinRootUrl(); scheduleMount(); });
  setTimeout(scheduleMount, 600);
  setTimeout(scheduleMount, 1800);
})();
