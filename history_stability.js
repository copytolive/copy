(function () {
  'use strict';

  var HL_INFO = 'https://api.hyperliquid.xyz/info';
  var DEXES = ['', 'xyz', 'km', 'vntl'];
  var POLL_MS = 3500;
  var ENGINE_EMPTY_GRACE_MS = 12000;

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
    raw = String(raw || '').toUpperCase().trim();
    if (raw.indexOf(':') >= 0) raw = raw.split(':').pop();
    raw = raw.replace('/USDC','').replace('/USDT','').replace('/USD','').replace('-USD','');
    return raw || '-';
  }
  function sideFromDirection(v) {
    v = String(v || '').toUpperCase();
    return (v.indexOf('SHORT') >= 0 || v.indexOf('SELL') >= 0) ? 'SELL' : 'BUY';
  }
  function fillIsEntry(f) {
    var dir = String((f && (f.dir || f._hlDir || f.direction)) || '').trim().toLowerCase();
    if (/^open\b/.test(dir)) return true;
    if (/^close\b/.test(dir) || dir.indexOf('>') >= 0) return false;
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
    var symbol = coin.charAt(0) === '@' ? coin : coin + '/USD';
    var du = dir.toUpperCase();
    var direction = du.indexOf('SHORT') >= 0 ? 'SHORT' : du.indexOf('LONG') >= 0 ? 'LONG' : (isBuy ? 'LONG' : 'SHORT');
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
  function cacheKey() {
    var w = walletKey();
    return w ? 'ctl_history_stable_v4:' + w : '';
  }
  function readCache() {
    var key = cacheKey();
    if (!key) return [];
    try {
      var p = JSON.parse(localStorage.getItem(key) || 'null');
      if (!p || !Array.isArray(p.fills) || !p.savedAt || Date.now() - p.savedAt > 6 * 60 * 60 * 1000) return [];
      return p.fills;
    } catch (e) { return []; }
  }
  function writeCache(fills) {
    var key = cacheKey();
    if (!key || !fills || !fills.length) return;
    try { localStorage.setItem(key, JSON.stringify({savedAt:Date.now(),fills:fills.slice(0,2000)})); } catch (e) {}
  }
  async function postInfo(payload, timeoutMs) {
    var c = new AbortController();
    var t = setTimeout(function(){ c.abort(); }, timeoutMs || 9000);
    try {
      var r = await fetch(HL_INFO, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload), cache:'no-store', signal:c.signal
      });
      if (!r.ok) throw new Error('Hyperliquid HTTP ' + r.status + ' · ' + payload.type);
      var d = await r.json();
      if (d && d.error) throw new Error(String(d.error));
      return d;
    } finally { clearTimeout(t); }
  }
  async function fetchLiveFills(wallet) {
    var raw = await postInfo({type:'userFills',user:wallet,aggregateByTime:true},9500);
    if (!Array.isArray(raw)) throw new Error('Hyperliquid userFills bukan array');
    var rows = raw.map(normalizeFill).filter(Boolean);
    rows.sort(function(a,b){ return Date.parse(b.timestamp||0)-Date.parse(a.timestamp||0); });
    return rows;
  }
  function normalizeVenueOrder(o, wallet, dex) {
    if (!o) return null;
    var coin = coinName(o.coin || o.symbol || '');
    var sideCode = String(o.side || '').toUpperCase();
    var side = sideCode === 'A' || sideCode === 'SELL' ? 'SELL' : 'BUY';
    var px = num(o.triggerPx,0) > 0 ? num(o.triggerPx) : num(o.limitPx != null ? o.limitPx : o.px,0);
    var rawTime = o.timestamp || o.time || Date.now();
    var ms = typeof rawTime === 'number' ? rawTime : Date.parse(rawTime || '');
    if (!Number.isFinite(ms)) ms = Date.now();
    return {
      order_id:o.oid || o.order_id || o.cloid || ('hl-open-'+coin+'-'+ms),
      oid:o.oid || o.order_id || null,
      created_at:new Date(ms).toISOString(), timestamp:new Date(ms).toISOString(),
      symbol:coin + '/USD', coin:coin, side:side,
      direction:side === 'SELL' ? 'SHORT' : 'LONG',
      lot:num(o.sz != null ? o.sz : o.origSz,0), size:num(o.sz != null ? o.sz : o.origSz,0),
      trigger_price:px, price:px, pnl:null,
      order_type:o.orderType || (o.isTrigger ? 'TRIGGER' : 'LIMIT'),
      _reduceOnly:!!o.reduceOnly, _isTrigger:!!o.isTrigger,
      _hlDex:dex || 'main', _hlAccount:wallet, _pendingSource:'HL_OPEN', _logKind:'pending', _raw:o
    };
  }
  async function fetchVenueOpenOrders(wallet) {
    var tasks = DEXES.map(function(dex){
      var p={type:'frontendOpenOrders',user:wallet}; if(dex) p.dex=dex;
      return {dex:dex,promise:postInfo(p,8500)};
    });
    var s = await Promise.allSettled(tasks.map(function(x){return x.promise;}));
    var rows=[], failed=0;
    s.forEach(function(res,i){
      if (res.status==='fulfilled' && Array.isArray(res.value)) {
        res.value.forEach(function(o){ var n=normalizeVenueOrder(o,wallet,tasks[i].dex); if(n) rows.push(n); });
      } else failed++;
    });
    var seen=Object.create(null),out=[];
    rows.forEach(function(o){
      var k=String(o._hlDex)+'|'+String(o.oid||o.order_id)+'|'+coinName(o.symbol)+'|'+String(o.trigger_price);
      if(seen[k]) return; seen[k]=1; out.push(o);
    });
    out.sort(function(a,b){return Date.parse(b.timestamp||0)-Date.parse(a.timestamp||0);});
    return {rows:out,complete:failed===0,failed:failed};
  }
  function looksLikeVenueRow(o) {
    return !!(o && (o._pendingSource === 'HL_OPEN' || o._hlAccount || o._hlDex));
  }
  function captureEnginePending(ctl) {
    var src = Array.isArray(window._allPending) ? window._allPending : [];
    var engine = src.filter(function(o){ return o && !looksLikeVenueRow(o); });
    if (engine.length) {
      ctl.enginePending = safeClone(engine);
      ctl.enginePendingSeenAt = Date.now();
      return;
    }
    if (src.length === 0 && ctl.enginePending.length && Date.now() - ctl.enginePendingSeenAt > ENGINE_EMPTY_GRACE_MS) {
      ctl.enginePending = [];
    }
  }
  function orderSide(o) {
    return String(o.side || sideFromDirection(o.direction || o.type)).toUpperCase().indexOf('SELL')>=0 ? 'SELL' : 'BUY';
  }
  function orderPrice(o) {
    return num(o.trigger_price != null ? o.trigger_price : (o.entry_price != null ? o.entry_price : o.price),0);
  }
  function orderSize(o) {
    return num(o.lot != null ? o.lot : (o.size != null ? o.size : o.sz),0);
  }
  function orderMatch(engine, venue) {
    var eCoin=coinName(engine.symbol||engine.coin), vCoin=coinName(venue.symbol||venue.coin);
    if(eCoin!==vCoin || orderSide(engine)!==orderSide(venue)) return false;
    var eo=String(engine.order_id||engine.oid||''), vo=String(venue.order_id||venue.oid||'');
    if(eo && vo && eo===vo) return true;
    var ep=orderPrice(engine),vp=orderPrice(venue),es=orderSize(engine),vs=orderSize(venue);
    var priceOk = ep>0 && vp>0 ? Math.abs(ep-vp)/Math.max(ep,vp) <= 0.003 : true;
    var sizeOk = es>0 && vs>0 ? Math.abs(es-vs)/Math.max(es,vs) <= 0.10 : true;
    return priceOk && sizeOk;
  }
  function pendingView(ctl) {
    var venueUsed=Object.create(null), rows=[], matched=0;
    ctl.enginePending.forEach(function(e,idx){
      var c=safeClone([e])[0] || {};
      var mi=-1;
      for(var j=0;j<ctl.venueOpen.length;j++) if(!venueUsed[j] && orderMatch(c,ctl.venueOpen[j])) {mi=j;break;}
      var baseDir=String(c.direction||c.side||'').toUpperCase();
      if(baseDir.indexOf('SHORT')>=0 || baseDir.indexOf('SELL')>=0) {c.side='SELL';c.direction='SHORT';}
      else {c.side='BUY';c.direction='LONG';}
      c._logKind='pending'; c._pendingSource='ENGINE';
      if(mi>=0) {venueUsed[mi]=1;matched++;c._pendingSource='ENGINE+HL';c.direction += ' · HL OPEN';c._hlMatch=ctl.venueOpen[mi];}
      else c.direction += ' · ENGINE';
      rows.push(c);
    });
    ctl.venueOpen.forEach(function(v,j){
      if(venueUsed[j]) return;
      var c=safeClone([v])[0] || {};
      c.direction=String(c.direction||'').toUpperCase() + ' · HL OPEN';
      c._pendingSource='HL_OPEN'; rows.push(c);
    });
    ctl.pendingMatched=matched;
    return rows;
  }

  function install() {
    var d=document, filters=d.getElementById('historyTypeFilters'), tbody=d.getElementById('historyTableBody');
    if(!filters||!tbody) return false;
    if(window.__CTL_HISTORY_STABLE__ && window.__CTL_HISTORY_STABLE__.ready && window.__CTL_HISTORY_STABLE__.version>=4){
      window.__CTL_HISTORY_STABLE__.sync('reinstall'); return true;
    }
    if(window.__CTL_HISTORY_STABLE__ && window.__CTL_HISTORY_STABLE__.timer) try{clearInterval(window.__CTL_HISTORY_STABLE__.timer);}catch(e){}

    var ctl={ready:true,version:4,source:'hyperliquid-userfills+engine-pending',mode:validMode(window._historyTypeFilter||'all'),fills:[],enginePending:[],venueOpen:[],enginePendingSeenAt:0,pendingMatched:0,lastRenderAt:0,lastPollOkAt:0,lastVenueOkAt:0,lastFillSignature:'',lastVenueSignature:'',restoring:false,polling:false,clickCount:0,lastError:''};
    window.__CTL_HISTORY_STABLE__=ctl;
    var cached=readCache(); if(cached.length) ctl.fills=safeClone(cached).map(normalizeFill).filter(Boolean);

    function buttons(){return Array.prototype.slice.call(d.querySelectorAll('.history-type-filter'));}
    function setActive(mode){
      mode=validMode(mode);ctl.mode=mode;window._historyTypeFilter=mode;
      buttons().forEach(function(btn){var a=btn.dataset.historyType===mode;btn.classList.toggle('active',a);btn.setAttribute('aria-pressed',a?'true':'false');btn.style.pointerEvents='auto';btn.style.cursor='pointer';btn.style.position='relative';btn.style.zIndex='3';});
    }
    function counts(){var pv=pendingView(ctl);return{all:ctl.fills.length,direct:directRows(ctl.fills).length,pending:pv.length,engine:ctl.enginePending.length,venue:ctl.venueOpen.length,matched:ctl.pendingMatched};}
    function updateInfo(){
      var info=d.getElementById('tradeLogInfo'),empty=d.getElementById('emptyHistory'),table=d.getElementById('historyTable'),c=counts(),shown=tbody.children.length;
      if(info){
        if(ctl.mode==='all') info.textContent=c.all?'Hyperliquid fills · '+c.all+' fills · menampilkan '+shown:(ctl.lastError?'Hyperliquid sync tertunda · data terakhir dipertahankan':'Hyperliquid fills · 0 fills');
        else if(ctl.mode==='direct') info.textContent='LANGSUNG ENTRY · '+c.direct+' entry dari '+c.all+' fills · Hyperliquid';
        else info.textContent='PENDING ORDER · Engine '+c.engine+' · HL open '+c.venue+' · matched '+c.matched;
        info.title='History: Hyperliquid userFills. Pending strategy/order: CopyToLive engine, direkonsiliasi dengan frontendOpenOrders Hyperliquid pada account aktif Main+xyz+km+vntl.';
      }
      if(shown>0){if(empty)empty.style.display='none';if(table)table.style.display='';return;}
      if(empty){empty.style.display='';var text=empty.querySelector('.text'),sub=empty.querySelector('.sub');
        if(ctl.mode==='pending'){if(text)text.textContent='Belum ada Pending Order yang dapat ditampilkan';if(sub)sub.textContent='Engine Pending = '+c.engine+' · Hyperliquid open = '+c.venue+'. Pending engine tetap source-of-truth; HL dipakai sebagai venue confirmation.';}
        else if(ctl.mode==='direct'){if(text)text.textContent='Tidak ada Open/Entry fill pada history ini';if(sub)sub.textContent='Entry dibaca dari field dir Hyperliquid (Open Long / Open Short), bukan dari closedPnl=0.';}
        else {if(text)text.textContent='No trade history yet';if(sub)sub.textContent='Trades will appear here from Hyperliquid userFills.';}
      }
      if(table)table.style.display='none';
    }
    function syncFillsToPage(){window._allFillsForLog=safeClone(ctl.fills);window._tradeLogAllFills=safeClone(ctl.fills);}
    function render(mode,reason){
      setActive(mode||ctl.mode);captureEnginePending(ctl);syncFillsToPage();
      if(typeof window._renderTradeLogRows==='function'){
        var originalPending=window._allPending;
        if(ctl.mode==='pending') window._allPending=pendingView(ctl);
        ctl.restoring=true;try{window._renderTradeLogRows();}catch(e){console.warn('[history-v4] render',e);}ctl.restoring=false;
        window._allPending=originalPending;
      }
      ctl.lastRenderAt=Date.now();setTimeout(updateInfo,0);
    }
    async function poll(reason){
      if(ctl.polling)return;var wallet=walletKey();captureEnginePending(ctl);if(!wallet){updateInfo();return;}
      ctl.polling=true;
      try{
        var res=await Promise.allSettled([fetchLiveFills(wallet),fetchVenueOpenOrders(wallet)]),changed=false;
        if(res[0].status==='fulfilled'){
          var f=res[0].value||[],fs=f.map(function(x){return String(x.trade_id)+':'+(x.is_entry?'E':'C')+':'+String(x.pnl);}).join('|');
          if(fs!==ctl.lastFillSignature){ctl.fills=f;ctl.lastFillSignature=fs;changed=true;}ctl.lastPollOkAt=Date.now();if(f.length)writeCache(f);
        }
        if(res[1].status==='fulfilled'){
          var vr=res[1].value||{rows:[],complete:false};
          if(vr.rows.length||vr.complete){var vs=vr.rows.map(function(x){return String(x._hlDex)+':'+String(x.order_id)+':'+String(x.trigger_price)+':'+String(x.lot);}).join('|');if(vs!==ctl.lastVenueSignature){ctl.venueOpen=vr.rows;ctl.lastVenueSignature=vs;changed=true;}ctl.lastVenueOkAt=Date.now();}
        }
        ctl.lastError='';syncFillsToPage();captureEnginePending(ctl);if(changed||ctl.mode==='pending')render(ctl.mode,reason||'poll');else updateInfo();
      }catch(e){ctl.lastError=e&&e.message?e.message:String(e);updateInfo();}finally{ctl.polling=false;}
    }
    ctl.setMode=function(mode){ctl.clickCount++;render(mode,'filter-click');poll('filter-refresh');};
    ctl.sync=function(reason){if(ctl.restoring)return;captureEnginePending(ctl);syncFillsToPage();setActive(window._historyTypeFilter||ctl.mode);if((ctl.mode==='all'&&ctl.fills.length&&tbody.children.length===0)||(ctl.mode==='direct'&&directRows(ctl.fills).length&&tbody.children.length===0)||(ctl.mode==='pending'&&pendingView(ctl).length&&tbody.children.length===0)){render(ctl.mode,reason||'recover');return;}updateInfo();};

    filters.style.position='relative';filters.style.zIndex='20';filters.style.pointerEvents='auto';
    filters.addEventListener('click',function(ev){var btn=ev.target&&ev.target.closest?ev.target.closest('.history-type-filter'):null;if(!btn||!filters.contains(btn))return;ev.preventDefault();ev.stopPropagation();if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();ctl.setMode(btn.dataset.historyType||'all');},true);
    filters.addEventListener('pointerdown',function(ev){var btn=ev.target&&ev.target.closest?ev.target.closest('.history-type-filter'):null;if(btn)btn.focus({preventScroll:true});},true);
    var obs=new MutationObserver(function(){clearTimeout(ctl._mutTimer);ctl._mutTimer=setTimeout(function(){ctl.sync('dom-mutation');},50);});obs.observe(tbody,{childList:true});ctl.observer=obs;

    captureEnginePending(ctl);syncFillsToPage();render(ctl.mode,'install-v4');poll('initial');ctl.timer=setInterval(function(){ctl.sync('heartbeat');poll('poll');},POLL_MS);return true;
  }

  window.__ctlInstallHistoryStability=install;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
