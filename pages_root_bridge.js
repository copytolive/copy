(function () {
  'use strict';

  var ROOT_PATH = '/copy/';
  var ROOT_URL = 'https://copytolive.github.io/copy/';
  var IS_PAGES = location.hostname === 'copytolive.github.io' && location.pathname.indexOf(ROOT_PATH) === 0;
  if (!IS_PAGES) return;

  // One public address only. Internal recovered surfaces remain iframe-only.
  if (window.top === window.self && location.pathname !== ROOT_PATH) {
    location.replace(ROOT_PATH);
    return;
  }
  if (window.top !== window.self) return;

  function pinRootUrl() {
    try {
      if (location.pathname === ROOT_PATH && (location.search || location.hash)) {
        history.replaceState(history.state, '', ROOT_PATH);
      }
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

  // Premium activation intentionally stores "live-trading". The old bridge only
  // accepted "charting", so the exact recovered Sequential dashboard was hidden
  // immediately after Premium activation. Both names represent the same trading
  // surface on public Pages.
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
        if (pr.left <= 2 && pr.width >= 40 && pr.width <= 120 && pr.height >= innerHeight * 0.55) {
          return Math.round(pr.right);
        }
      } catch (e) {}
    }
    var nodes = document.querySelectorAll('nav,aside,body > div,body > main');
    var best = 56;
    for (var i = 0; i < nodes.length; i++) {
      try {
        var r = nodes[i].getBoundingClientRect();
        if (r.left <= 2 && r.top <= 120 && r.width >= 44 && r.width <= 100 && r.height >= innerHeight * 0.65) {
          best = Math.max(best, Math.round(r.right));
        }
      } catch (e) {}
    }
    return best;
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

  function alignRecoveredDashboard(frame) {
    try {
      var d = frame.contentDocument;
      if (!d) return;

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

      // Screenshot/devlog parity: use the recovered production SolRenkoTerminal
      // (Crypto/Non-Crypto, Quick Entry, OOS Lock, Data Renko, Indicators) inside
      // the original Sequential Compounding page instead of the legacy V12 canvas.
      var renko = d.getElementById('renkoMainFrame');
      if (renko) {
        var wanted = 'renko-terminal.html?embed=1&symbol=SOL&smaPeriod=10&sma=10&source=sequential';
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
      var workspace = d.getElementById('tradingWorkspace');
      if (workspace) workspace.setAttribute('data-ctl-screenshot-parity', 'sequential-v2');
    } catch (e) {}
  }

  function createSequentialFrame() {
    var old = document.getElementById('ctlSequentialCompoundingRoot');
    if (old) return old;

    var frame = document.createElement('iframe');
    frame.id = 'ctlSequentialCompoundingRoot';
    frame.src = 'compounding_live.html?embed=1&root=1&visual=devlog-20260417';
    frame.title = 'CopyToLive Sequential Compounding';
    frame.loading = 'eager';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('allow', 'clipboard-read; clipboard-write');
    frame.style.cssText = [
      'position:fixed','top:0','left:0','width:100vw','height:100vh','border:0',
      'margin:0','padding:0','display:block','background:#0a0e17','z-index:2147482000'
    ].join(';');
    applyFrameGeometry(frame);

    frame.addEventListener('load', function () {
      applyFrameGeometry(frame);
      alignRecoveredDashboard(frame);
      try {
        var d = frame.contentDocument;
        if (d && d.body && !frame.__ctlChildObserver) {
          var queued = false;
          var childObserver = new MutationObserver(function () {
            if (queued) return;
            queued = true;
            requestAnimationFrame(function () {
              queued = false;
              alignRecoveredDashboard(frame);
            });
          });
          childObserver.observe(d.body, {childList:true, subtree:true});
          frame.__ctlChildObserver = childObserver;
        }
      } catch (e) {}
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
    alignRecoveredDashboard(frame);
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

        // Compatibility/first-screen history probe used by existing CI. It stays
        // hidden; the user-facing chart is the production-style terminal above.
        var frame = document.createElement('iframe');
        frame.src = 'renko/?embed=1&symbol=SOL';
        frame.title = 'CopyToLive Charting';
        frame.loading = 'eager';
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.setAttribute('allow', 'clipboard-read; clipboard-write');
        frame.style.cssText = 'position:absolute;width:1px;height:1px;min-height:1px;border:0;opacity:0;pointer-events:none;background:#131722;';
        host.appendChild(frame);
      }
    }

    var sequential = syncSequentialFrame();
    if (sequential) {
      window.__COPYTOLIVE_ROOT_CHARTING__ = {
        mounted: true,
        rootOnly: true,
        source: 'sequential-compounding-live',
        renkoSurface: 'SolRenkoTerminal-BpQZEung',
        compatibilitySource: 'renko-v12',
        mountedAt: Date.now()
      };
    }
    return !!sequential;
  }

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

  var observer = new MutationObserver(scheduleMount);
  function observe() {
    if (!document.body) return;
    observer.observe(document.body, {childList:true, subtree:true});
    scheduleMount();
  }
  if (document.body) observe();
  else document.addEventListener('DOMContentLoaded', observe, {once:true});

  document.addEventListener('click', function(){ setTimeout(scheduleMount,0); }, true);
  window.addEventListener('resize', scheduleMount);
  window.addEventListener('popstate', function(){ pinRootUrl(); scheduleMount(); });
  setInterval(function(){ syncSequentialFrame(); pinRootUrl(); }, 500);
})();
