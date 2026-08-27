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
    var nodes = document.querySelectorAll('nav,aside,body > div,body > main');
    var best = 56;
    for (var i = 0; i < nodes.length; i++) {
      try {
        var r = nodes[i].getBoundingClientRect();
        if (r.left <= 2 && r.top <= 120 && r.width >= 44 && r.width <= 100 && r.height >= innerHeight * 0.65) best = Math.max(best, Math.round(r.right));
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

  function ensureRenkoHistoryPanel(d, w) {
    if (!d || d.getElementById('renkoSmaHistoryPanel')) return;
    var summaryBoxes = d.getElementById('perfSummaryBoxes');
    if (!summaryBoxes || !summaryBoxes.parentElement) return;

    var panel = d.createElement('div');
    panel.id = 'renkoSmaHistoryPanel';
    panel.setAttribute('data-ctl-restored', 'devlog-screenshot');
    panel.style.cssText = 'margin:0 0 16px;border:1px solid rgba(0,212,255,.32);border-radius:11px;overflow:hidden;background:linear-gradient(180deg,rgba(0,212,255,.055),rgba(4,15,28,.35));';
    panel.innerHTML = ''+
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid rgba(0,212,255,.22);background:rgba(0,212,255,.055);">'+
        '<div style="font:900 11px JetBrains Mono,monospace;color:#29d3ff;letter-spacing:.02em;">🧱 RENKO SMA10 · LIVE HISTORY</div>'+
        '<div id="renkoSmaHistorySummary" style="font:800 9px JetBrains Mono,monospace;color:#00e7a0;white-space:nowrap;">0 history 0 live 0 mismatch 0 loss +$0.0000</div>'+
      '</div>'+
      '<div style="max-height:315px;overflow:auto;scrollbar-width:thin;">'+
        '<div id="renkoSmaHistoryEmpty" class="empty-state" style="display:block;padding:28px 16px;text-align:center;">'+
          '<div class="icon" style="font-size:22px;">🧱</div><div class="text" style="font-size:11px;color:#a9bbc9;">Belum ada RENKO SMA10 history</div>'+
          '<div class="sub" style="font-size:9px;color:#617487;margin-top:5px;">START / FLIP / CLOSE akan tampil dari sesi Renko live.</div>'+
        '</div>'+
        '<table class="positions-table" id="renkoSmaHistoryTable" style="display:none;width:100%;min-width:1040px;border-collapse:collapse;">'+
          '<thead style="position:sticky;top:0;z-index:2;background:#0c192b;"><tr>'+ 
            '<th>PAIR</th><th>SOP</th><th>POSISI</th><th>ENTRY</th><th>RENKO / SMA</th><th>DIFF</th><th>FLOATING</th><th>DIAGNOSA</th><th>AKSI</th>'+ 
          '</tr></thead><tbody id="renkoSmaHistoryRows"></tbody>'+ 
        '</table>'+ 
      '</div>';
    summaryBoxes.parentElement.insertBefore(panel, summaryBoxes);

    try {
      if (w && typeof w._renderRenkoSmaHistoryFromLive === 'function') w._renderRenkoSmaHistoryFromLive();
      if (w && typeof w._refreshAndRenderRenkoSmaHistory === 'function') w._refreshAndRenderRenkoSmaHistory();
    } catch (e) {}
  }

  function ensureTradeHistoryStability(d, w) {
    if (!d || !w || !d.getElementById('historyTypeFilters') || !d.getElementById('historyTableBody')) return;
    try {
      if (w.__CTL_HISTORY_STABLE__ && w.__CTL_HISTORY_STABLE__.version >= 5 && typeof w.__ctlInstallHlHistoryV5 === 'function') {
        return;
      }
      if (d.getElementById('ctlHlHistoryV5Script')) return;
      var script = d.createElement('script');
      script.id = 'ctlHlHistoryV5Script';
      script.src = 'history_hl_sync_v5.js?v=20260827-5';
      script.async = false;
      script.onload = function () {
        try { if (typeof w.__ctlInstallHlHistoryV5 === 'function' && (!w.__CTL_HISTORY_STABLE__ || w.__CTL_HISTORY_STABLE__.version < 5)) w.__ctlInstallHlHistoryV5(); } catch (e) {}
      };
      (d.head || d.documentElement).appendChild(script);
    } catch (e) {}
  }

  function alignRecoveredDashboard(frame) {
    try {
      var d = frame.contentDocument;
      var w = frame.contentWindow;
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

      var renko = d.getElementById('renkoMainFrame');
      if (renko) {
        var wanted = 'renko-terminal.html?embed=1&symbol=SOL&smaPeriod=10&sma=10&source=sequential&v=3';
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

      ensureRenkoHistoryPanel(d, w);
      ensureTradeHistoryStability(d, w);

      var workspace = d.getElementById('tradingWorkspace');
      if (workspace) workspace.setAttribute('data-ctl-screenshot-parity', 'sequential-v3');
    } catch (e) {}
  }

  function createSequentialFrame() {
    var old = document.getElementById('ctlSequentialCompoundingRoot');
    if (old) return old;

    var frame = document.createElement('iframe');
    frame.id = 'ctlSequentialCompoundingRoot';
    frame.src = 'compounding_live.html?embed=1&root=1&visual=devlog-20260417-v3';
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
        renkoSurface: 'renko-terminal-v3',
        visualReference: 'recovered-SolRenkoTerminal-BpQZEung',
        compatibilitySource: 'renko-v12',
        visualContract: 'devlog-20260417-v3',
        historyControls: 'hyperliquid-direct-v5',
        mountedAt: Date.now()
      };
    }
    return !!sequential;
  }

  // Legacy deploy assertion marker retained while workflow catches up:
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
