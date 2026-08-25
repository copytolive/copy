(function () {
  'use strict';

  var IS_PAGES = location.hostname === 'copytolive.github.io' && location.pathname.indexOf('/copy/') === 0;
  if (!IS_PAGES) return;

  var HL_INFO = 'https://api.hyperliquid.xyz/info';
  var LEGACY_OWNER_KEY = 'ctl_hl_account_wallet_v2';
  var ROLE_CACHE_KEY = 'ctl_hl_role_map_v1';
  var RELOAD_KEY = 'ctl_hl_account_reload_v3';
  var busy = false;

  function valid(v) { return /^0x[a-fA-F0-9]{40}$/.test(String(v || '').trim()); }
  function lower(v) { return valid(v) ? String(v).toLowerCase() : ''; }
  function short(v) { v = String(v || ''); return valid(v) ? v.slice(0,8) + '…' + v.slice(-6) : '—'; }
  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function sessionEmail() {
    try {
      var u = JSON.parse(localStorage.getItem('session_user') || 'null');
      return u && u.email ? String(u.email).trim().toLowerCase() : '';
    } catch(e) { return ''; }
  }
  function sessionKey(prefix) {
    return prefix + ':' + encodeURIComponent(sessionEmail() || 'anonymous');
  }
  function ownerKey() { return sessionKey('ctl_hl_account_wallet_v3'); }
  function manualKey() { return sessionKey('ctl_hl_account_manual_v3'); }
  function resolutionKey() { return sessionKey('ctl_hl_resolution_v3'); }

  async function info(payload) {
    var r = await fetch(HL_INFO, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload),
      cache: 'no-store'
    });
    if (!r.ok) throw new Error('Hyperliquid HTTP ' + r.status + ' · ' + payload.type);
    var d = await r.json();
    if (d && d.error) throw new Error(String(d.error));
    return d;
  }
  function roleCache() {
    try { return JSON.parse(localStorage.getItem(ROLE_CACHE_KEY) || '{}') || {}; }
    catch(e) { return {}; }
  }
  function saveRoleCache(m) {
    try { localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(m)); } catch(e) {}
  }

  async function resolveRole(raw) {
    raw = lower(raw);
    if (!raw) return {raw:'', account:'', role:'missing', resolved:false};
    var m = roleCache();
    var c = m[raw];
    if (c && c.at && Date.now() - c.at < 86400000 && valid(c.account)) {
      var ca = lower(c.account);
      return {raw:raw, account:ca, role:c.role || 'user', resolved:ca !== raw, cached:true};
    }
    var d = await info({type:'userRole', user:raw});
    var role = String((d && d.role) || 'missing');
    var account = raw;
    if (role === 'agent' && d && d.data && valid(d.data.user)) {
      account = lower(d.data.user);
    }
    m[raw] = {account:account, role:role, at:Date.now()};
    saveRoleCache(m);
    return {raw:raw, account:account, role:role, resolved:account !== raw, detail:d};
  }

  function currentCandidate() {
    var email = sessionEmail();
    var candidates = [];
    function add(v, source) {
      v = lower(v);
      if (!v) return;
      for (var i=0;i<candidates.length;i++) if (candidates[i].address === v) return;
      candidates.push({address:v, source:source});
    }

    // The per-email wallet from the original CopyToLive architecture is the
    // authoritative browser-side identity for the current Premium session.
    try { if (email) add(localStorage.getItem('ot_wallet_' + email), 'session-wallet'); } catch(e) {}
    try { add(localStorage.getItem(manualKey()), 'manual-session'); } catch(e) {}
    add(window._hlAccountWallet, 'runtime-account');
    add(window._userWallet, 'runtime-wallet');
    try { add(localStorage.getItem(ownerKey()), 'resolved-session'); } catch(e) {}

    // Migration fallback only. Never enumerate all ot_wallet_* keys because that
    // can mix data belonging to a different Premium login on the same browser.
    if (!candidates.length) {
      try { add(localStorage.getItem(LEGACY_OWNER_KEY), 'legacy-migration'); } catch(e) {}
    }
    return candidates.length ? candidates[0] : null;
  }

  function spotUsdc(spot) {
    var total = 0;
    (((spot || {}).balances) || []).forEach(function(b) {
      if (String(b.coin || '').toUpperCase() === 'USDC') total += num(b.total);
    });
    return total;
  }
  function perpEvidence(states) {
    var balance = 0, positions = 0;
    (states || []).forEach(function(s) {
      balance += num(((s || {}).marginSummary || {}).accountValue);
      (((s || {}).assetPositions) || []).forEach(function(p) {
        var q = (p || {}).position || {};
        if (Math.abs(num(q.szi)) > 0) positions++;
      });
    });
    return {balance:balance, positions:positions};
  }

  async function snapshot(account) {
    account = lower(account);
    if (!account) return {account:'',fills:0,balance:0,positions:0,errors:['invalid account']};
    var req = [
      info({type:'userFills', user:account, aggregateByTime:true}),
      info({type:'spotClearinghouseState', user:account}),
      info({type:'clearinghouseState', user:account}),
      info({type:'clearinghouseState', user:account, dex:'xyz'}),
      info({type:'clearinghouseState', user:account, dex:'km'}),
      info({type:'clearinghouseState', user:account, dex:'vntl'})
    ];
    var r = await Promise.allSettled(req), errors = [];
    r.forEach(function(x) {
      if (x.status === 'rejected') errors.push(x.reason && x.reason.message ? x.reason.message : String(x.reason));
    });
    var fills = r[0].status === 'fulfilled' && Array.isArray(r[0].value) ? r[0].value : [];
    var spot = r[1].status === 'fulfilled' ? r[1].value : {};
    var states = [];
    for (var i=2;i<6;i++) if (r[i].status === 'fulfilled') states.push(r[i].value || {});
    var pe = perpEvidence(states), sb = spotUsdc(spot);
    return {
      account:account,
      fills:fills.length,
      balance:sb > 0 ? sb : pe.balance,
      spot:sb,
      perps:pe.balance,
      positions:pe.positions,
      errors:errors
    };
  }

  function hasEvidence(s) {
    return !!s && (num(s.fills) > 0 || num(s.balance) > 0 || num(s.positions) > 0);
  }
  function evidenceScore(s) {
    if (!s) return -1;
    return num(s.fills) * 1000000000 + num(s.balance) * 1000000 + num(s.positions) * 1000 - ((s.errors || []).length * 10);
  }

  async function chooseAccount(resolved) {
    var base = lower(resolved.account);
    var baseSnap = await snapshot(base);

    // Never leave the account that the current Premium session resolved to if it
    // already has real wallet evidence. This prevents stale subaccount history
    // from replacing a currently funded account.
    if (hasEvidence(baseSnap)) {
      return {account:base, source:resolved.resolved ? 'agent-owner' : 'account', snapshot:baseSnap};
    }
    if (String(resolved.role).toLowerCase() === 'subaccount') {
      return {account:base, source:'subaccount', snapshot:baseSnap};
    }

    // Only when the resolved account is truly empty do we inspect its subaccounts.
    var subs = [];
    try {
      var d = await info({type:'subAccounts', user:base});
      if (Array.isArray(d)) subs = d.slice(0,12);
    } catch(e) {}
    if (!subs.length) return {account:base, source:resolved.resolved ? 'agent-owner-empty' : 'account-empty', snapshot:baseSnap};

    var probes = await Promise.all(subs.map(async function(s) {
      var a = lower(s && s.subAccountUser);
      if (!a) return null;
      try { return {meta:s, snap:await snapshot(a)}; }
      catch(e) { return null; }
    }));
    probes = probes.filter(function(x){ return x && hasEvidence(x.snap); });
    if (!probes.length) return {account:base, source:resolved.resolved ? 'agent-owner-empty' : 'account-empty', snapshot:baseSnap};
    probes.sort(function(a,b){ return evidenceScore(b.snap) - evidenceScore(a.snap); });
    return {
      account:probes[0].snap.account,
      source:'subaccount-active',
      snapshot:probes[0].snap,
      name:(probes[0].meta || {}).name || ''
    };
  }

  function auditBadge() {
    var el = document.getElementById('pagesHlAudit');
    if (el) return el;
    var anchor = document.getElementById('walletBadge') || document.getElementById('tradeLogInfo') || document.getElementById('historyCount');
    if (!anchor || !anchor.parentElement) return null;
    el = document.createElement('div');
    el.id = 'pagesHlAudit';
    el.style.cssText = 'margin-left:6px;padding:3px 7px;border-radius:6px;background:rgba(0,230,118,.08);border:1px solid rgba(0,230,118,.2);font:800 9px JetBrains Mono,monospace;color:#00e676;white-space:nowrap';
    anchor.parentElement.appendChild(el);
    return el;
  }
  function paintAudit(resolved, selected) {
    var s = selected.snapshot || {}, el = auditBadge();
    if (!el) return;
    var ok = hasEvidence(s) && !(s.errors || []).length;
    el.textContent = (ok ? 'HL ✓ ' : 'HL ⚠ ') + String(selected.source || 'ACCOUNT').toUpperCase() + ' · $' + num(s.balance).toFixed(2) + ' · ' + num(s.positions) + ' pos · ' + num(s.fills) + ' fills';
    el.title = 'query=' + selected.account + ' | raw=' + (resolved.raw || '') + ' | role=' + resolved.role + ' | errors=' + ((s.errors || []).join(' | ') || 'none');
    el.style.color = ok ? '#00e676' : '#ffd740';
  }
  function updateWalletBadge(account, raw, source) {
    var b = document.getElementById('walletBadge');
    if (b) {
      b.textContent = '🔗 ' + short(account);
      b.title = account + (raw && raw !== account ? ' · API Agent ' + raw : '') + ' · ' + source;
    }
    var l = document.getElementById('hlWalletLabel');
    if (l) {
      l.textContent = 'HL Account ' + short(account) + (raw && raw !== account ? ' · from API Agent ' + short(raw) : '');
      l.style.color = '#00e676';
      l.title = account;
    }
  }

  function applyAccount(account, raw, role, source) {
    account = lower(account); raw = lower(raw) || account;
    if (!account) return false;
    var previous = lower(window._hlAccountWallet) || lower(window._userWallet);
    window._hlAccountWallet = account;
    window._userWallet = account;
    if (raw !== account) window._hlAgentWallet = raw;
    window._pagesHlResolvedRole = role || 'user';
    window._pagesHlAccountSource = source || 'account';

    var email = sessionEmail();
    try { localStorage.setItem(ownerKey(), account); } catch(e) {}
    try { if (email) localStorage.setItem('ot_wallet_' + email, account); } catch(e) {}
    try {
      localStorage.setItem(resolutionKey(), JSON.stringify({raw:raw,account:account,role:role||'user',source:source||'account',at:Date.now()}));
    } catch(e) {}
    updateWalletBadge(account, raw, source || 'account');

    var changed = (raw !== account) || (previous && previous !== account);
    try {
      if (changed && sessionStorage.getItem(RELOAD_KEY) !== account) {
        sessionStorage.setItem(RELOAD_KEY, account);
        var q = new URLSearchParams(location.search);
        q.set('hlowner', account.slice(2,10));
        q.set('hlrole', role || 'user');
        q.set('hlsource', source || 'account');
        setTimeout(function(){ location.replace(location.pathname + '?' + q.toString() + location.hash); }, 120);
        return true;
      }
    } catch(e) {}

    try { if (typeof window.fetchStatus === 'function') window.fetchStatus(); } catch(e) {}
    try { if (typeof window.fetchHistory === 'function') window.fetchHistory(); } catch(e) {}
    return false;
  }

  function ensureUi() {
    if (document.getElementById('pagesHlOwnerOverlay')) return;
    var o = document.createElement('div');
    o.id = 'pagesHlOwnerOverlay';
    o.style.cssText = 'display:none;position:fixed;inset:0;z-index:2147483000;background:rgba(2,7,13,.9);backdrop-filter:blur(9px);align-items:center;justify-content:center;padding:18px';
    o.innerHTML = '<div style="width:min(520px,100%);background:#09131f;border:1px solid #1d3d59;border-radius:16px;padding:24px;color:#fff;font-family:Inter,sans-serif;box-shadow:0 25px 90px rgba(0,0,0,.55)">' +
      '<div style="font-size:10px;color:#00e676;font-weight:900;letter-spacing:.11em">HYPERLIQUID ACCOUNT</div>' +
      '<h2 style="font-size:21px;margin:9px 0 7px">Hubungkan Account Wallet</h2>' +
      '<p id="pagesHlOwnerReason" style="font-size:12px;line-height:1.6;color:#91a4b8;margin:0 0 14px">Masukkan alamat Account Wallet Hyperliquid. Jangan masukkan private key/API key.</p>' +
      '<input id="pagesHlOwnerInput" placeholder="0x... Account Wallet" style="width:100%;height:44px;border:1px solid #234764;border-radius:9px;background:#05101b;color:#fff;padding:0 12px;font:12px JetBrains Mono,monospace;outline:none" />' +
      '<div id="pagesHlOwnerError" style="display:none;margin-top:9px;padding:9px;border-radius:8px;background:rgba(255,82,82,.09);border:1px solid rgba(255,82,82,.25);font-size:11px;color:#ff9aa6"></div>' +
      '<button onclick="window.copyPagesUseHlOwner()" style="width:100%;height:43px;margin-top:12px;border:0;border-radius:9px;background:linear-gradient(135deg,#00d4ff,#00e6a0);color:#021017;font-weight:900;cursor:pointer">Gunakan Account Wallet</button>' +
      '<button onclick="window.copyPagesConnectHlWallet()" style="width:100%;height:41px;margin-top:8px;border:1px solid #27445c;border-radius:9px;background:#0c1b29;color:#c5d5e4;font-weight:800;cursor:pointer">Connect Browser Wallet</button>' +
      '<a href="https://app.hyperliquid.xyz/portfolio" target="_blank" rel="noopener" style="display:block;text-align:center;margin-top:13px;color:#6ecfe0;font-size:11px">Buka Hyperliquid untuk cek Account Address ↗</a>' +
      '<p style="font-size:10px;line-height:1.55;color:#667b90;margin:14px 0 0">Resolver hanya memakai wallet untuk Premium login yang sedang aktif. API Agent otomatis diarahkan ke account pemilik. Private key tidak dibaca/disimpan.</p>' +
      '</div>';
    document.body.appendChild(o);
  }
  function show(reason, value) {
    ensureUi();
    var o = document.getElementById('pagesHlOwnerOverlay'); if (o) o.style.display = 'flex';
    var r = document.getElementById('pagesHlOwnerReason'); if (r) r.innerHTML = reason || 'Hubungkan Hyperliquid Account.';
    var i = document.getElementById('pagesHlOwnerInput'); if (i && value) i.value = value;
  }
  function hide() { var o = document.getElementById('pagesHlOwnerOverlay'); if (o) o.style.display = 'none'; }
  function error(msg) { var e = document.getElementById('pagesHlOwnerError'); if (e) { e.textContent = msg; e.style.display = 'block'; } }

  async function resolveSelected(raw) {
    var rr = await resolveRole(raw);
    if (!valid(rr.account)) throw new Error('Hyperliquid account tidak dapat di-resolve.');
    var sel = await chooseAccount(rr);
    return {resolved:rr, selected:sel};
  }

  window.copyPagesUseHlOwner = async function() {
    try {
      var i = document.getElementById('pagesHlOwnerInput');
      var raw = i ? i.value.trim() : '';
      if (!valid(raw)) { error('Alamat harus 0x + 40 hex. Jangan masukkan private key/API key.'); return; }
      try { localStorage.setItem(manualKey(), lower(raw)); } catch(e) {}
      var pair = await resolveSelected(raw), rr = pair.resolved, sel = pair.selected;
      paintAudit(rr, sel);
      if (!hasEvidence(sel.snapshot) && !(sel.snapshot.errors || []).length) {
        show('Hyperliquid mengembalikan <b>0 balance · 0 posisi · 0 fills</b> untuk alamat ini. Masukkan Account Wallet yang sama dengan yang dipakai di copytolive.com.', raw);
        return;
      }
      var reloading = applyAccount(sel.account, rr.raw, rr.role, sel.source);
      if (reloading) return;
      hide();
      setTimeout(function(){ try { if (typeof window.fetchStatus === 'function') window.fetchStatus(); } catch(e){} },300);
      setTimeout(function(){ try { if (typeof window.fetchHistory === 'function') window.fetchHistory(); } catch(e){} },900);
    } catch(e) { error(e && e.message ? e.message : String(e)); }
  };

  window.copyPagesConnectHlWallet = async function() {
    try {
      if (!window.ethereum || !window.ethereum.request) throw new Error('Browser wallet extension tidak ditemukan. Gunakan input Account Wallet.');
      var a = await window.ethereum.request({method:'eth_requestAccounts'});
      if (!a || !valid(a[0])) throw new Error('Wallet tidak memberikan alamat valid.');
      var i = document.getElementById('pagesHlOwnerInput'); if (i) i.value = a[0];
      await window.copyPagesUseHlOwner();
    } catch(e) { error(e && e.message ? e.message : String(e)); }
  };
  window.copyPagesChangeHlOwner = function() {
    show('Ganti <b>Hyperliquid Account Wallet</b> untuk Premium login ini.', window._hlAccountWallet || window._userWallet || '');
  };

  function addSwitchButton() {
    if (document.getElementById('pagesHlOwnerSwitch')) return;
    var a = document.getElementById('walletBadge') || document.getElementById('tradeLogInfo');
    if (!a || !a.parentElement) return;
    var b = document.createElement('button');
    b.id = 'pagesHlOwnerSwitch';
    b.textContent = '⇄ HL Account';
    b.onclick = window.copyPagesChangeHlOwner;
    b.style.cssText = 'margin-left:8px;border:1px solid rgba(0,212,255,.25);background:rgba(0,212,255,.07);color:#6ee7f5;border-radius:6px;padding:3px 7px;font-size:9px;font-weight:800;cursor:pointer';
    a.parentElement.appendChild(b);
  }

  async function boot() {
    if (busy) return;
    busy = true;
    try {
      ensureUi();
      var c = currentCandidate();
      if (!c) {
        show('GitHub Pages belum mempunyai <b>Hyperliquid Account Wallet</b> untuk Premium login ini. Hubungkan account Anda; private key tidak diperlukan.', '');
        return;
      }
      var pair = await resolveSelected(c.address), rr = pair.resolved, sel = pair.selected;
      paintAudit(rr, sel);

      if (!hasEvidence(sel.snapshot) && !(sel.snapshot.errors || []).length) {
        show('Alamat <b>' + short(sel.account) + '</b> tervalidasi tetapi Hyperliquid mengembalikan <b>0 balance · 0 posisi · 0 fills</b>. Pilih Account Wallet yang sama dengan account copytolive.com.', c.address);
        return;
      }
      if ((sel.snapshot.errors || []).length && !hasEvidence(sel.snapshot)) {
        show('Hyperliquid belum dapat membaca account ini: <b>' + (sel.snapshot.errors || []).join(' · ') + '</b>. Coba Account Wallet utama.', c.address);
        return;
      }

      var reloading = applyAccount(sel.account, rr.raw, rr.role, sel.source);
      if (reloading) return;
      hide();
      addSwitchButton();
      setTimeout(addSwitchButton,800);
      [350,1000,2600,5200].forEach(function(ms) {
        setTimeout(function() {
          try { if (typeof window.fetchStatus === 'function') window.fetchStatus(); } catch(e) {}
          try { if (typeof window.fetchHistory === 'function') window.fetchHistory(); } catch(e) {}
        }, ms);
      });
      console.info('[Pages HL Account Resolver]', {
        session:sessionEmail(), candidateSource:c.source, raw:rr.raw, role:rr.role,
        resolvedOwner:rr.account, selected:sel.account, source:sel.source, snapshot:sel.snapshot
      });
    } catch(e) {
      console.warn('[Pages HL Account Resolver]', e);
      show('Resolver Hyperliquid gagal: ' + (e && e.message ? e.message : String(e)), (currentCandidate() || {}).address || '');
    } finally { busy = false; }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(addSwitchButton,1500);
})();