(function () {
  'use strict';

  var HL_INFO = 'https://api.hyperliquid.xyz/info';
  var DEXES = ['', 'xyz', 'km', 'vntl'];
  var FAMILY_TTL = 60000;
  var POLL_MS = 3500;

  function validMode(mode) {
    return ['all', 'pending', 'direct'].indexOf(mode) >= 0 ? mode : 'all';
  }

  function validWallet(v) {
    return /^0x[a-fA-F0-9]{40}$/.test(String(v || '').trim());
  }

  function walletKey() {
    var wallet = String(window._hlAccountWallet || window._userWallet || '').toLowerCase();
    return validWallet(wallet) ? wallet : '';
  }

  function num(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : (fallback == null ? 0 : fallback);
  }

  function safeClone(arr) {
    if (!Array.isArray(arr)) return [];
    try { return JSON.parse(JSON.stringify(arr)); } catch (e) { return arr.slice(); }
  }

  function coinName(raw) {
    raw = String(raw || '');
    if (!raw) return '-';
    if (raw.indexOf(':') >= 0) raw = raw.split(':').pop();
    return raw;
  }

  function fillIsEntry(f) {
    var dir = String((f && (f.dir || f._hlDir || f.direction)) || '').trim().toLowerCase();
    if (/^open\b/.test(dir)) return true;
    if (dir === 'buy') return true;
    if (/^close\b/.test(dir) || dir.indexOf('>') >= 0 || dir === 'sell') return false;
    if (f && typeof f.is_entry === 'boolean') return f.is_entry;
    return false;
  }

  function normalizeFill(f) {
    if (!f) return null;
    var rawTime = f.time != null ? f.time : (f.timestamp || f.closed_at || f.created_at || 0);
    var ms = typeof rawTime === 'number' ? rawTime : Date.parse(rawTime || '');
    if (!Number.isFinite(ms)) ms = 0;
    var dir = String(f.dir || f._hlDir || f.direction || '').trim();
    var isEntry = fillIsEntry(f);
    var sideCode = String(f.side || '').toUpperCase();
    var isBuy = sideCode === 'B' || sideCode === 'BUY' || String(f.type || '').toUpperCase() === 'BUY';
    var pnlRaw = f.closedPnl != null ? f.closedPnl : f.pnl;
    var pnl = isEntry ? null : num(pnlRaw, 0);
    var coin = coinName(f.coin || f.symbol || '');
    var symbol = coin.indexOf('/') >= 0 ? coin : (coin.charAt(0) === '@' ? coin : coin + '/USD');
    var dUpper = dir.toUpperCase();
    var direction = dUpper.indexOf('SHORT') >= 0 ? 'SHORT' : dUpper.indexOf('LONG') >= 0 ? 'LONG' : (isBuy ? 'LONG' : 'SHORT');
    return {
      trade_id: f.tid || f.trade_id || f.oid || f.order_id || f.hash || (symbol + '-' + ms),
      timestamp: ms ? new Date(ms).toISOString() : (f.timestamp || f.closed_at || ''),
      closed_at: ms ? new Date(ms).toISOString() : (f.closed_at || ''),
      symbol: symbol,
      coin: coin,
      type: isBuy ? 'BUY' : 'SELL',
      side: isBuy ? 'BUY' : 'SELL',
      direction: direction,
      volume: num(f.sz != null ? f.sz : (f.volume != null ? f.volume : f.lot), 0),
      lot: num(f.sz != null ? f.sz : (f.lot != null ? f.lot : f.volume), 0),
      price: num(f.px != null ? f.px : (f.price != null ? f.price : f.entry_price), 0),
      entry_price: num(f.px != null ? f.px : (f.entry_price != null ? f.entry_price : f.price), 0),
      pnl: pnl,
      closedPnl: pnl,
      is_entry: isEntry,
      _logKind: isEntry ? 'direct' : 'close',
      _hlDir: dir,
      _hlOid: f.oid || f.order_id || null,
      _hlTid: f.tid || null,
      _fee: num(f.fee, 0),
      _feeToken: f.feeToken || '',
      _crossed: !!f.crossed,
      _raw: f
    };
  }

  function directRows(fills) {
    return (fills || []).filter(function (t) { return !!(t && t.is_entry); });
  }

  function pendingRows(pending) {
    return Array.isArray(pending) ? pending.filter(Boolean) : [];
  }

  function cacheKey() {
    var w = walletKey();
    return w ? 'ctl_history_stable_v3:' + w : '';
  }

  function readCache() {
    var key = cacheKey();
    if (!key) return [];
    try {
      var payload = JSON.parse(localStorage.getItem(key) || 'null');
      if (!payload || !Array.isArray(payload.fills)) return [];
      if (!payload.savedAt || Date.now() - payload.savedAt > 6 * 60 * 60 * 1000) return [];
      return payload.fills;
    } catch (e) { return []; }
  }

  function writeCache(fills) {
    var key = cacheKey();
    if (!key || !Array.isArray(fills) || !fills.length) return;
    try {
      localStorage.setItem(key, JSON.stringify({savedAt: Date.now(), fills: fills.slice(0, 2000)}));
    } catch (e) {}
  }

  async function postInfo(payload, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 9000);
    try {
      var r = await fetch(HL_INFO, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload),
        cache: 'no-store',
        signal: controller.signal
      });
      if (!r.ok) throw new Error('Hyperliquid HTTP ' + r.status + ' · ' + payload.type);
      var d = await r.json();
      if (d && d.error) throw new Error(String(d.error));
      return d;
    } finally {
      clearTimeout(timer);
    }
  }

  function openOrderPayload(wallet, dex) {
    var p = {type:'frontendOpenOrders', user:wallet};
    if (dex) p.dex = dex;
    return p;
  }

  function normalizeOrder(o, account, dex) {
    if (!o) return null;
    var coin = coinName(o.coin || o.symbol || '');
    var sideCode = String(o.side || '').toUpperCase();
    var isBuy = sideCode === 'B' || sideCode === 'BUY';
    var px = num(o.triggerPx, 0) > 0 ? num(o.triggerPx) : num(o.limitPx != null ? o.limitPx : o.px, 0);
    var rawTime = o.timestamp || o.time || Date.now();
    var ms = typeof rawTime === 'number' ? rawTime : Date.parse(rawTime || '');
    if (!Number.isFinite(ms)) ms = Date.now();
    return {
      order_id: o.oid || o.order_id || o.cloid || ('hl-open-' + coin + '-' + ms),
      oid: o.oid || o.order_id || null,
      created_at: new Date(ms).toISOString(),
      timestamp: new Date(ms).toISOString(),
      symbol: coin.charAt(0) === '@' ? coin : coin + '/USD',
      coin: coin,
      side: isBuy ? 'BUY' : 'SELL',
      direction: isBuy ? 'LONG' : 'SHORT',
      lot: num(o.sz != null ? o.sz : o.origSz, 0),
      size: num(o.sz != null ? o.sz : o.origSz, 0),
      trigger_price: px,
      price: px,
      pnl: null,
      order_type: o.orderType || (o.isTrigger ? 'TRIGGER' : 'LIMIT'),
      reduce_only: !!o.reduceOnly,
      _reduceOnly: !!o.reduceOnly,
      _isTrigger: !!o.isTrigger,
      _triggerCondition: o.triggerCondition || '',
      _hlDex: dex || 'main',
      _hlAccount: account,
      _logKind: 'pending',
      _raw: o
    };
  }

  function dedupeOrders(rows) {
    var seen = Object.create(null), out = [];
    (rows || []).forEach(function (o) {
      if (!o) return;
      var key = String(o._hlAccount || '') + '|' + String(o._hlDex || '') + '|' + String(o.oid || o.order_id || '') + '|' + String(o.symbol || '') + '|' + String(o.trigger_price || '');
      if (seen[key]) return;
      seen[key] = 1;
      out.push(o);
    });
    out.sort(function (a,b) { return Date.parse(b.timestamp || 0) - Date.parse(a.timestamp || 0); });
    return out;
  }

  async function accountFamily(ctl, wallet) {
    if (ctl.familyWallet === wallet && ctl.familyAt && Date.now() - ctl.familyAt < FAMILY_TTL && ctl.family.length) return ctl.family.slice();
    var family = [wallet];
    try {
      var subs = await postInfo({type:'subAccounts', user:wallet}, 8000);
      if (Array.isArray(subs)) {
        subs.forEach(function (s) {
          var a = String((s && s.subAccountUser) || '').toLowerCase();
          if (validWallet(a) && family.indexOf(a) < 0) family.push(a);
        });
      }
    } catch (e) {}
    ctl.familyWallet = wallet;
    ctl.family = family;
    ctl.familyAt = Date.now();
    return family.slice();
  }

  async function fetchOpenOrdersForFamily(ctl, wallet) {
    var family = await accountFamily(ctl, wallet);
    var tasks = [];
    family.forEach(function (account) {
      DEXES.forEach(function (dex) {
        tasks.push({account:account, dex:dex, promise:postInfo(openOrderPayload(account, dex), 8500)});
      });
    });
    var settled = await Promise.allSettled(tasks.map(function (x) { return x.promise; }));
    var rows = [], ok = 0, failed = 0;
    settled.forEach(function (res, i) {
      var meta = tasks[i];
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        ok++;
        res.value.forEach(function (o) {
          var n = normalizeOrder(o, meta.account, meta.dex);
          if (n) rows.push(n);
        });
      } else {
        failed++;
      }
    });
    return {rows:dedupeOrders(rows), complete:failed === 0, ok:ok, failed:failed, family:family};
  }

  async function fetchLiveFills(wallet) {
    var raw = await postInfo({type:'userFills', user:wallet, aggregateByTime:true}, 9500);
    if (!Array.isArray(raw)) throw new Error('Hyperliquid userFills bukan array');
    var rows = raw.map(normalizeFill).filter(Boolean);
    rows.sort(function (a,b) { return Date.parse(b.timestamp || 0) - Date.parse(a.timestamp || 0); });
    return rows;
  }

  function install() {
    var d = document;
    var filters = d.getElementById('historyTypeFilters');
    var tbody = d.getElementById('historyTableBody');
    if (!filters || !tbody) return false;

    if (window.__CTL_HISTORY_STABLE__ && window.__CTL_HISTORY_STABLE__.ready && window.__CTL_HISTORY_STABLE__.version >= 3) {
      window.__CTL_HISTORY_STABLE__.sync('reinstall');
      return true;
    }

    if (window.__CTL_HISTORY_STABLE__ && window.__CTL_HISTORY_STABLE__.timer) {
      try { clearInterval(window.__CTL_HISTORY_STABLE__.timer); } catch (e) {}
    }

    var ctl = {
      ready: true,
      version: 3,
      source: 'hyperliquid-direct',
      mode: validMode(window._historyTypeFilter || 'all'),
      fills: [],
      pending: [],
      family: [],
      familyWallet: '',
      familyAt: 0,
      lastNonEmptyAt: 0,
      lastRenderAt: 0,
      lastPollAt: 0,
      lastPollOkAt: 0,
      lastPendingOkAt: 0,
      lastFillSignature: '',
      lastPendingSignature: '',
      restoring: false,
      polling: false,
      clickCount: 0,
      lastReason: 'init',
      lastError: ''
    };
    window.__CTL_HISTORY_STABLE__ = ctl;

    var cached = readCache();
    if (cached.length) ctl.fills = safeClone(cached).map(normalizeFill).filter(Boolean);

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
            : (ctl.lastError ? 'Hyperliquid sync tertunda · mempertahankan data terakhir' : 'Hyperliquid fills · 0 fills');
        } else if (mode === 'pending') {
          info.textContent = 'PENDING ORDER · ' + counts.pending + ' open · Hyperliquid LIVE';
        } else {
          info.textContent = 'LANGSUNG ENTRY · ' + counts.direct + ' entry dari ' + counts.all + ' fills · Hyperliquid';
        }
        info.title = 'Source: api.hyperliquid.xyz/info · account/subaccount aktif · Main+xyz+km+vntl pending';
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
          if (text) text.textContent = 'Tidak ada open order Hyperliquid saat ini';
          if (sub) sub.textContent = 'Sumber langsung: frontendOpenOrders Main + xyz + km + vntl, termasuk subaccount.';
        } else if (mode === 'direct') {
          if (text) text.textContent = 'Tidak ada Open/Entry fill pada history ini';
          if (sub) sub.textContent = 'Entry ditentukan dari field dir Hyperliquid (Open Long / Open Short), bukan dari P&L=0.';
        } else {
          if (text) text.textContent = 'No trade history yet';
          if (sub) sub.textContent = 'Trades will appear here from Hyperliquid userFills.';
        }
      }
      if (table && shown === 0) table.style.display = 'none';
    }

    function syncSourcesToPage() {
      window._allFillsForLog = safeClone(ctl.fills);
      window._tradeLogAllFills = safeClone(ctl.fills);
      window._allPending = safeClone(ctl.pending);
    }

    function captureLegacyFallback() {
      if (ctl.lastPollOkAt) return;
      var liveFills = [];
      if (Array.isArray(window._allFillsForLog) && window._allFillsForLog.length) liveFills = window._allFillsForLog;
      else if (Array.isArray(window._tradeLogAllFills) && window._tradeLogAllFills.length) liveFills = window._tradeLogAllFills;
      if (liveFills.length && !ctl.fills.length) {
        ctl.fills = liveFills.map(normalizeFill).filter(Boolean);
        ctl.lastNonEmptyAt = Date.now();
        writeCache(ctl.fills);
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
      syncSourcesToPage();

      if (typeof window._renderTradeLogRows === 'function') {
        ctl.restoring = true;
        try { window._renderTradeLogRows(); } catch (e) { console.warn('[history-stability-v3] render', e); }
        ctl.restoring = false;
      }
      ctl.lastRenderAt = Date.now();
      setTimeout(updateEmptyAndInfo, 0);
    }

    async function pollHyperliquid(reason) {
      if (ctl.polling) return;
      var wallet = walletKey();
      if (!wallet) {
        captureLegacyFallback();
        updateEmptyAndInfo();
        return;
      }
      ctl.polling = true;
      ctl.lastPollAt = Date.now();
      try {
        var pair = await Promise.allSettled([
          fetchLiveFills(wallet),
          fetchOpenOrdersForFamily(ctl, wallet)
        ]);
        var changed = false;
        if (pair[0].status === 'fulfilled') {
          var fills = pair[0].value || [];
          var fsig = fills.slice(0,2000).map(function (x) { return String(x.trade_id) + ':' + String(x.is_entry ? 1 : 0) + ':' + String(x.pnl); }).join('|');
          if (fsig !== ctl.lastFillSignature) {
            ctl.fills = fills;
            ctl.lastFillSignature = fsig;
            changed = true;
          }
          ctl.lastPollOkAt = Date.now();
          if (fills.length) {
            ctl.lastNonEmptyAt = Date.now();
            writeCache(fills);
          }
        }
        if (pair[1].status === 'fulfilled') {
          var pr = pair[1].value || {rows:[],complete:false};
          if (pr.rows.length || pr.complete) {
            var psig = pr.rows.map(function (x) { return String(x._hlAccount) + ':' + String(x._hlDex) + ':' + String(x.order_id) + ':' + String(x.trigger_price) + ':' + String(x.lot); }).join('|');
            if (psig !== ctl.lastPendingSignature) {
              ctl.pending = pr.rows;
              ctl.lastPendingSignature = psig;
              changed = true;
            }
            ctl.lastPendingOkAt = Date.now();
          }
        }
        ctl.lastError = '';
        syncSourcesToPage();
        if (changed || expectedCount(ctl.mode) !== tbody.children.length) render(ctl.mode, reason || 'hl-poll');
        else updateEmptyAndInfo();
      } catch (e) {
        ctl.lastError = e && e.message ? e.message : String(e);
        syncSourcesToPage();
        updateEmptyAndInfo();
      } finally {
        ctl.polling = false;
      }
    }

    ctl.setMode = function (mode) {
      ctl.clickCount++;
      render(mode, 'filter-click');
      pollHyperliquid('filter-refresh');
    };

    ctl.sync = function (reason) {
      if (ctl.restoring) return;
      captureLegacyFallback();
      setActive(window._historyTypeFilter || ctl.mode);
      syncSourcesToPage();
      var need = expectedCount(ctl.mode);
      var shown = tbody.children.length;
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
      ctl._mutTimer = setTimeout(function () { ctl.sync('dom-mutation'); }, 50);
    });
    obs.observe(tbody, {childList:true});
    ctl.observer = obs;

    captureLegacyFallback();
    syncSourcesToPage();
    render(ctl.mode, 'install-v3');
    pollHyperliquid('initial');
    ctl.timer = setInterval(function () {
      ctl.sync('heartbeat');
      pollHyperliquid('poll');
    }, POLL_MS);
    return true;
  }

  window.__ctlInstallHistoryStability = install;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
