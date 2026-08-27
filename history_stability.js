(function () {
  'use strict';

  function validMode(mode) {
    return ['all', 'pending', 'direct'].indexOf(mode) >= 0 ? mode : 'all';
  }

  function walletKey() {
    var wallet = String(window._hlAccountWallet || window._userWallet || '').toLowerCase();
    return /^0x[a-f0-9]{40}$/.test(wallet) ? wallet : '';
  }

  function safeClone(arr) {
    if (!Array.isArray(arr)) return [];
    try { return JSON.parse(JSON.stringify(arr)); } catch (e) { return arr.slice(); }
  }

  function directRows(fills) {
    return (fills || []).filter(function (t) {
      if (!t) return false;
      if (t.is_entry === true) return true;
      var kind = String(t._logKind || t.kind || t.event || '').toLowerCase();
      if (kind === 'direct' || kind === 'entry' || kind === 'open') return true;
      var reason = String(t.direction || t.status || '').toUpperCase();
      return reason === 'FILL' || reason.indexOf('OPEN') >= 0;
    });
  }

  function pendingRows(pending) {
    return Array.isArray(pending) ? pending.filter(Boolean) : [];
  }

  function cacheKey() {
    var w = walletKey();
    return w ? 'ctl_history_stable_v2:' + w : '';
  }

  function readCache() {
    var key = cacheKey();
    if (!key) return [];
    try {
      var payload = JSON.parse(localStorage.getItem(key) || 'null');
      if (!payload || !Array.isArray(payload.fills)) return [];
      // Keep cache fresh enough to bridge transient API gaps, not to impersonate live state forever.
      if (!payload.savedAt || Date.now() - payload.savedAt > 6 * 60 * 60 * 1000) return [];
      return payload.fills;
    } catch (e) { return []; }
  }

  function writeCache(fills) {
    var key = cacheKey();
    if (!key || !Array.isArray(fills) || !fills.length) return;
    try {
      // 1,500 fills is comfortably below browser storage limits for this payload.
      localStorage.setItem(key, JSON.stringify({savedAt: Date.now(), fills: fills.slice(0, 1500)}));
    } catch (e) {}
  }

  function install() {
    var d = document;
    var filters = d.getElementById('historyTypeFilters');
    var tbody = d.getElementById('historyTableBody');
    if (!filters || !tbody) return false;

    if (window.__CTL_HISTORY_STABLE__ && window.__CTL_HISTORY_STABLE__.ready) {
      window.__CTL_HISTORY_STABLE__.sync('reinstall');
      return true;
    }

    var ctl = {
      ready: true,
      version: 2,
      mode: validMode(window._historyTypeFilter || 'all'),
      fills: [],
      pending: [],
      lastNonEmptyAt: 0,
      lastRenderAt: 0,
      restoring: false,
      clickCount: 0,
      lastReason: 'init'
    };
    window.__CTL_HISTORY_STABLE__ = ctl;

    var cached = readCache();
    if (cached.length) ctl.fills = safeClone(cached);

    function buttons() {
      return Array.prototype.slice.call(d.querySelectorAll('.history-type-filter'));
    }

    function dataCounts() {
      return {
        all: ctl.fills.length,
        pending: pendingRows(ctl.pending).length,
        direct: directRows(ctl.fills).length
      };
    }

    function setActive(mode) {
      mode = validMode(mode);
      ctl.mode = mode;
      window._historyTypeFilter = mode;
      buttons().forEach(function (btn) {
        var active = btn.dataset.historyType === mode;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.style.pointerEvents = 'auto';
        btn.style.cursor = 'pointer';
        btn.style.position = 'relative';
        btn.style.zIndex = '3';
      });
    }

    function updateEmptyAndInfo() {
      var info = d.getElementById('tradeLogInfo');
      var empty = d.getElementById('emptyHistory');
      var table = d.getElementById('historyTable');
      var counts = dataCounts();
      var mode = ctl.mode;
      var shown = tbody ? tbody.children.length : 0;

      if (info) {
        if (mode === 'all') {
          info.textContent = counts.all
            ? 'Hyperliquid fills · ' + counts.all + ' fills · menampilkan ' + shown
            : 'Hyperliquid fills · 0 fills';
        } else if (mode === 'pending') {
          info.textContent = 'PENDING ORDER · ' + counts.pending + ' hasil';
        } else {
          info.textContent = 'LANGSUNG ENTRY · ' + counts.direct + ' hasil dari ' + counts.all + ' fills';
        }
      }

      if (shown > 0) {
        if (empty) empty.style.display = 'none';
        if (table) table.style.display = '';
        return;
      }

      if (empty) {
        empty.style.display = '';
        var text = empty.querySelector('.text');
        var sub = empty.querySelector('.sub');
        if (mode === 'pending') {
          if (text) text.textContent = 'Tidak ada Pending Order saat ini';
          if (sub) sub.textContent = 'Klik ALL untuk kembali ke seluruh history Hyperliquid.';
        } else if (mode === 'direct') {
          if (text) text.textContent = 'Tidak ada Langsung Entry pada history ini';
          if (sub) sub.textContent = 'Klik ALL untuk kembali ke seluruh fills Hyperliquid.';
        } else {
          if (text) text.textContent = 'No trade history yet';
          if (sub) sub.textContent = 'Trades will appear here as positions close (SL/TP)';
        }
      }
      if (table && shown === 0) table.style.display = 'none';
    }

    function captureSources() {
      var liveFills = [];
      if (Array.isArray(window._allFillsForLog) && window._allFillsForLog.length) liveFills = window._allFillsForLog;
      else if (Array.isArray(window._tradeLogAllFills) && window._tradeLogAllFills.length) liveFills = window._tradeLogAllFills;

      if (liveFills.length) {
        ctl.fills = safeClone(liveFills);
        ctl.lastNonEmptyAt = Date.now();
        writeCache(ctl.fills);
      }
      if (Array.isArray(window._allPending)) ctl.pending = safeClone(window._allPending);
    }

    function restoreSources() {
      if (ctl.fills.length) {
        if (!Array.isArray(window._allFillsForLog) || !window._allFillsForLog.length) window._allFillsForLog = safeClone(ctl.fills);
        if (!Array.isArray(window._tradeLogAllFills) || !window._tradeLogAllFills.length) window._tradeLogAllFills = safeClone(ctl.fills);
      }
      if (ctl.pending.length && (!Array.isArray(window._allPending) || !window._allPending.length)) {
        window._allPending = safeClone(ctl.pending);
      }
    }

    function expectedCount(mode) {
      var counts = dataCounts();
      return counts[validMode(mode)];
    }

    function render(mode, reason) {
      mode = validMode(mode || ctl.mode);
      ctl.lastReason = reason || 'render';
      setActive(mode);
      restoreSources();

      // The page's own renderer preserves the original table layout and row-click chart behavior.
      if (typeof window._renderTradeLogRows === 'function') {
        ctl.restoring = true;
        try { window._renderTradeLogRows(); } catch (e) { console.warn('[history-stability] render', e); }
        ctl.restoring = false;
      }
      ctl.lastRenderAt = Date.now();
      setTimeout(updateEmptyAndInfo, 0);
    }

    ctl.setMode = function (mode) {
      ctl.clickCount++;
      render(mode, 'filter-click');
    };

    ctl.sync = function (reason) {
      if (ctl.restoring) return;
      captureSources();
      setActive(window._historyTypeFilter || ctl.mode);

      var need = expectedCount(ctl.mode);
      var shown = tbody.children.length;

      // A transient empty HL response must not erase a previously confirmed history.
      // Restore only when the selected filter actually has cached rows; legitimate 0-result
      // filters keep their explicit empty message instead of showing fake rows.
      if (need > 0 && shown === 0 && Date.now() - ctl.lastRenderAt > 120) {
        render(ctl.mode, reason || 'transient-empty');
        return;
      }
      updateEmptyAndInfo();
    };

    filters.style.position = 'relative';
    filters.style.zIndex = '20';
    filters.style.pointerEvents = 'auto';
    var panel = d.getElementById('backtestHistoryPanel');
    if (panel) {
      panel.style.position = 'relative';
      panel.style.zIndex = '2';
      panel.style.pointerEvents = 'auto';
    }

    // Capture phase intentionally owns these three filter buttons. This bypasses stale
    // inline handlers/focus overlays while leaving row clicks and other dashboard controls alone.
    filters.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('.history-type-filter') : null;
      if (!btn || !filters.contains(btn)) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
      ctl.setMode(btn.dataset.historyType || 'all');
    }, true);

    filters.addEventListener('pointerdown', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('.history-type-filter') : null;
      if (btn) btn.focus({preventScroll:true});
    }, true);

    var obs = new MutationObserver(function () {
      clearTimeout(ctl._mutTimer);
      ctl._mutTimer = setTimeout(function () { ctl.sync('dom-mutation'); }, 40);
    });
    obs.observe(tbody, {childList:true});
    ctl.observer = obs;
    ctl.timer = setInterval(function () { ctl.sync('heartbeat'); }, 900);

    captureSources();
    restoreSources();
    render(ctl.mode, 'install');
    return true;
  }

  window.__ctlInstallHistoryStability = install;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
