(function () {
  'use strict';

  var ROOT_PATH = '/copy/';
  var ROOT_URL = 'https://copytolive.github.io/copy/';
  var IS_PAGES = location.hostname === 'copytolive.github.io' && location.pathname.indexOf(ROOT_PATH) === 0;
  if (!IS_PAGES) return;

  // Public/top-level navigation has exactly one address. Internal HTML files
  // may still be used inside same-origin iframes, but opening one directly
  // returns immediately to the single CopyToLive root URL.
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

  function currentViewIsCharting() {
    try {
      var mode = String(localStorage.getItem('ot_backtest_view_mode') || '').toLowerCase();
      if (mode === 'charting') return true;
      if (mode && mode !== 'charting') return false;
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

  function hideEmbeddedGates(frame) {
    try {
      var d = frame.contentDocument;
      if (!d) return;
      var ids = ['loginOverlay', 'walletConnectOverlay'];
      for (var i = 0; i < ids.length; i++) {
        var el = d.getElementById(ids[i]);
        if (el) el.style.setProperty('display', 'none', 'important');
      }
      var owner = d.getElementById('pagesHlOwnerOverlay');
      if (owner && !window._ctlShowWalletChooser) owner.style.setProperty('display', 'none', 'important');
      d.documentElement.style.background = '#0a0e17';
      d.body.style.background = '#0a0e17';
      d.body.style.margin = '0';
      d.body.setAttribute('data-ctl-root-embedded', '1');
    } catch (e) {}
  }

  function createSequentialFrame() {
    var old = document.getElementById('ctlSequentialCompoundingRoot');
    if (old) return old;

    var frame = document.createElement('iframe');
    frame.id = 'ctlSequentialCompoundingRoot';
    frame.src = 'compounding_live.html?embed=1&root=1';
    frame.title = 'CopyToLive Sequential Compounding';
    frame.loading = 'eager';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('allow', 'clipboard-read; clipboard-write');
    frame.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:100vw',
      'height:100vh',
      'border:0',
      'margin:0',
      'padding:0',
      'display:block',
      'background:#0a0e17',
      'z-index:2147482000'
    ].join(';');
    applyFrameGeometry(frame);

    frame.addEventListener('load', function () {
      applyFrameGeometry(frame);
      hideEmbeddedGates(frame);
      try {
        var d = frame.contentDocument;
        if (d && d.body) {
          var childObserver = new MutationObserver(function () { hideEmbeddedGates(frame); });
          childObserver.observe(d.body, {childList:true, subtree:true, attributes:true, attributeFilter:['style','class']});
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
    hideEmbeddedGates(frame);
    return true;
  }

  function mountLiveCharting() {
    var title = findMaintenanceTitle();
    if (!title) {
      syncSequentialFrame();
      return false;
    }

    var card = title.parentElement;
    var host = card && card.parentElement;
    if (!host) return false;
    if (host.getAttribute('data-ctl-charting-live') === '1') {
      syncSequentialFrame();
      return true;
    }

    // Keep the lightweight Renko runtime underneath for compatibility and
    // first-screen history validation. The user-facing surface is the full
    // Sequential Compounding dashboard mounted above it.
    host.setAttribute('data-ctl-charting-live', '1');
    host.className = 'flex-1 min-h-0';
    host.style.cssText = 'position:relative;display:block;overflow:hidden;padding:0;min-height:0;background:#131722;text-align:initial;';
    host.innerHTML = '';

    var frame = document.createElement('iframe');
    frame.src = 'renko/?embed=1&symbol=SOL';
    frame.title = 'CopyToLive Charting';
    frame.loading = 'eager';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('allow', 'clipboard-read; clipboard-write');
    frame.style.cssText = 'position:absolute;width:1px;height:1px;min-height:1px;border:0;opacity:0;pointer-events:none;background:#131722;';
    host.appendChild(frame);

    var sequential = createSequentialFrame();
    sequential.style.display = 'block';

    window.__COPYTOLIVE_ROOT_CHARTING__ = {
      mounted: true,
      rootOnly: true,
      source: 'sequential-compounding-live',
      compatibilitySource: 'renko-v12',
      mountedAt: Date.now()
    };
    return true;
  }

  installCanonical();
  pinRootUrl();

  var scheduled = false;
  function scheduleMount() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      mountLiveCharting();
      syncSequentialFrame();
      pinRootUrl();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleMount, { once: true });
  } else {
    scheduleMount();
  }

  var observer = new MutationObserver(scheduleMount);
  function observe() {
    if (!document.body) return;
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleMount();
  }
  if (document.body) observe();
  else document.addEventListener('DOMContentLoaded', observe, { once: true });

  document.addEventListener('click', function () { setTimeout(scheduleMount, 0); }, true);
  window.addEventListener('resize', scheduleMount);
  window.addEventListener('popstate', function () { pinRootUrl(); scheduleMount(); });
  setInterval(function () { syncSequentialFrame(); pinRootUrl(); }, 250);
})();
