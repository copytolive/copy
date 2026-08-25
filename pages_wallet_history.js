(function () {
  'use strict';

  var IS_PAGES = location.hostname === 'narzulalistiqlal.github.io' && location.pathname.indexOf('/copy/') === 0;
  if (!IS_PAGES) return;

  var HL_INFO = 'https://api.hyperliquid.xyz/info';
  var IDR = 17100;
  var cache = { wallet:'', balance:null, fills:null, portfolio:null, positions:null, lastError:'', syncedAt:0 };
  var syncBusy = false;
  var lastBalanceSignature = '';
  var lastPositionSignature = '';
  var lastHistorySignature = '';
  var stableText = Object.create(null);
  var stableColor = Object.create(null);
  var stableHtml = Object.create(null);
  var protectedIds = {
    capital:1, capitalIDR:1, perfCapital:1, perfCapitalIDR:1,
    perfIsolated:1, perfAvailable:1, walletBreakdown:1,
    historyCount:1, trades:1
  };
  var restoringStableView = false;

  function num(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : (fallback == null ? 0 : fallback);
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function setText(id, value, color) {
    var el = document.getElementById(id);
    if (!el) return;
    var text = String(value);
    if (protectedIds[id]) {
      stableText[id] = text;
      if (color) stableColor[id] = color;
    }
    if (el.textContent !== text) el.textContent = text;
    if (color) el.style.color = color;
  }
  function restoreStableView() {
    if (restoringStableView) return;
    restoringStableView = true;
    try {
      Object.keys(stableText).forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (el.textContent !== stableText[id]) el.textContent = stableText[id];
        if (stableColor[id] && el.style.color !== stableColor[id]) el.style.color = stableColor[id];
      });
      Object.keys(stableHtml).forEach(function(id) {
        var el = document.getElementById(id);
        if (el && el.innerHTML !== stableHtml[id]) el.innerHTML = stableHtml[id];
      });
    } finally {
      restoringStableView = false;
    }
  }
  function installStableViewGuard() {
    if (window.__pagesHlStableViewGuard) return;
    window.__pagesHlStableViewGuard = true;
    var queued = false;
    new MutationObserver(function(mutations) {
      if (restoringStableView || queued) return;
      var relevant = mutations.some(function(m) {
        var n = m.target && (m.target.nodeType === 1 ? m.target : m.target.parentElement);
        while (n && n !== document.body) {
          if (n.id && protectedIds[n.id]) return true;
          n = n.parentElement;
        }
        return false;
      });
      if (!relevant) return;
      queued = true;
      Promise.resolve().then(function() {
        queued = false;
        restoreStableView();
      });
    }).observe(document.body, {subtree:true, childList:true, characterData:true});
  }
  function setDisplay(id, value) {
    var el = document.getElementById(id);
    if (el) el.style.display = value;
  }
  function replaceText(root, from, to) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.indexOf(from) >= 0) node.nodeValue = node.nodeValue.split(from).join(to);
    }
  }
  function validWallet(v) { return /^0x[a-fA-F0-9]{40}$/.test(String(v || '').trim()); }
  function activeWallet() {
    var candidates = [window._hlAccountWallet, window._userWallet];
    try {
      var u = JSON.parse(localStorage.getItem('session_user') || 'null');
      if (u && u.email) candidates.push(localStorage.getItem('ot_wallet_' + u.email));
    } catch(e) {}
    try {
      for (var i=0;i<localStorage.length;i++) {
        var k = localStorage.key(i) || '';
        if (k.indexOf('ot_wallet_') === 0) candidates.push(localStorage.getItem(k));
      }
    } catch(e) {}
    for (var j=0;j<candidates.length;j++) if (validWallet(candidates[j])) return String(candidates[j]).toLowerCase();
    return '';
  }
  async function postInfo(payload) {
    var r = await fetch(HL_INFO, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), cache:'no-store' });
    if (!r.ok) throw new Error('Hyperliquid HTTP ' + r.status + ' for ' + payload.type);
    var d = await r.json();
    if (d && d.error) throw new Error(String(d.error));
    return d;
  }

  function setAllPairMode() {
    if (window._historySymbolFilter !== '') {
      window._historySymbolFilter = '';
      window._lastHistoryRenderHash = null;
      window._lastHistoryRenderTime = 0;
    }
    replaceText(document.body, 'GOLD · Live Performance & Trade History', 'HYPERLIQUID · Live Performance & Trade History');
    replaceText(document.body, 'Detailed Trade Log · GOLD Only', 'Detailed Trade Log · ALL PAIRS');
    replaceText(document.body, 'Grafik Pertumbuhan Equity · GOLD', 'Grafik Pertumbuhan Equity · HYPERLIQUID');
    replaceText(document.body, 'Belum ada trade GOLD yang sudah ditutup', 'Belum ada trade Hyperliquid yang sudah ditutup');
    var renkoEmpty = document.getElementById('renkoSmaHistoryEmpty');
    if (renkoEmpty && !renkoEmpty.dataset.pagesOriginNote) {
      renkoEmpty.dataset.pagesOriginNote = '1';
      var sub = renkoEmpty.querySelector('.sub');
      if (sub) sub.textContent = 'Event START/FLIP/CLOSE lama tersimpan per-domain. Trade wallet asli tetap dipulihkan langsung dari Hyperliquid pada log di bawah.';
    }
  }

  function installHistoryTypeFilter() {
    if (window.setHistoryTypeFilter && window.setHistoryTypeFilter._pagesStable) return;
    window.setHistoryTypeFilter = function(type) {
      type = /^(renko|backtest)$/.test(String(type || '')) ? String(type) : 'all';
      window._historyTypeFilter = type;
      try { sessionStorage.setItem('copy_history_type_filter', type); } catch(e) {}
      var renko = document.getElementById('renkoSmaHistoryPanel');
      var backtest = document.getElementById('backtestHistoryPanel');
      if (renko) renko.style.display = type === 'backtest' ? 'none' : '';
      if (backtest) backtest.style.display = type === 'renko' ? 'none' : '';
      document.querySelectorAll('.history-type-filter').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-history-type') === type);
      });
      var note = document.getElementById('historyTypeFilterNote');
      if (note) note.textContent = type === 'renko'
        ? 'START / FLIP / CLOSE Renko'
        : type === 'backtest'
          ? 'Backtest execution · Hyperliquid wallet fills'
          : 'Renko event + Hyperliquid wallet fills';
    };
    window.setHistoryTypeFilter._pagesStable = true;
    var saved = 'all';
    try { saved = sessionStorage.getItem('copy_history_type_filter') || 'all'; } catch(e) {}
    window.setHistoryTypeFilter(saved);
  }

  function parseBalance(states, spot) {
    var acct = 0, margin = 0, withdrawable = 0, positions = [];
    (states || []).forEach(function(state) {
      if (!state || typeof state !== 'object') return;
      var ms = state.marginSummary || {};
      acct += Math.max(0, num(ms.accountValue));
      margin += Math.max(0, num(ms.totalMarginUsed));
      withdrawable += Math.max(0, num(state.withdrawable));
      (state.assetPositions || []).forEach(function(p) {
        var pos = p && p.position ? p.position : p;
        if (!pos || Math.abs(num(pos.szi)) <= 0) return;
        positions.push(pos);
      });
    });
    var spotTotal = 0, spotHold = 0;
    ((spot && spot.balances) || []).forEach(function(b) {
      if (String(b.coin || '').toUpperCase() === 'USDC') { spotTotal = num(b.total); spotHold = num(b.hold); }
    });
    var spotAvailable = Math.max(0, spotTotal - spotHold);
    var perpsAvailable = withdrawable > 0 ? withdrawable : Math.max(0, acct - margin);
    var display = spotTotal > 0 ? spotTotal : Math.max(0, acct) + Math.max(0, spotAvailable);
    if (!(display > 0) && acct > 0) display = acct;
    return {
      display: display,
      execution: acct,
      available: spotTotal > 0 ? spotAvailable : perpsAvailable + spotAvailable,
      perpsAvailable: perpsAvailable,
      margin: spotTotal > 0 ? Math.max(0, spotHold) : margin,
      spot: spotTotal,
      positions: positions
    };
  }

  function portfolioStats(raw) {
    var map = {};
    (Array.isArray(raw) ? raw : []).forEach(function(row){ if (row && row.length >= 2) map[row[0]] = row[1]; });
    var p = map.allTime || map.month || map.week || map.day || null;
    if (!p) return null;
    var avh = Array.isArray(p.accountValueHistory) ? p.accountValueHistory : [];
    var pnlh = Array.isArray(p.pnlHistory) ? p.pnlHistory : [];
    var endEq = avh.length ? num(avh[avh.length-1][1], null) : null;
    var net = pnlh.length ? num(pnlh[pnlh.length-1][1], null) : null;
    var peak = -Infinity, maxDDpct = 0, maxDDval = 0;
    avh.forEach(function(r){
      var v = num(r && r[1], NaN); if (!Number.isFinite(v)) return;
      if (v > peak) peak = v;
      if (peak > 0) { var ddv = peak - v, ddp = ddv / peak * 100; if (ddp > maxDDpct) { maxDDpct = ddp; maxDDval = ddv; } }
    });
    return { raw:p, avh:avh, pnlh:pnlh, endEquity:endEq, netPnl:net, maxDDpct:maxDDpct, maxDDval:maxDDval };
  }

  function fillStats(fills) {
    fills = Array.isArray(fills) ? fills : [];
    var closed = fills.filter(function(f){ return Math.abs(num(f.closedPnl)) > 1e-12; });
    var wins = closed.filter(function(f){ return num(f.closedPnl) > 0; });
    var losses = closed.filter(function(f){ return num(f.closedPnl) < 0; });
    var gp = wins.reduce(function(s,f){ return s + num(f.closedPnl); },0);
    var gl = Math.abs(losses.reduce(function(s,f){ return s + num(f.closedPnl); },0));
    var net = closed.reduce(function(s,f){ return s + num(f.closedPnl); },0);
    var avgW = wins.length ? gp / wins.length : 0;
    var avgL = losses.length ? gl / losses.length : 0;
    var wr = closed.length ? wins.length / closed.length * 100 : 0;
    var rr = avgL > 0 ? avgW / avgL : 0;
    var pf = gl > 0 ? gp / gl : (gp > 0 ? Infinity : 0);
    var largestProfit = wins.length ? Math.max.apply(null, wins.map(function(f){return num(f.closedPnl)})) : 0;
    var largestLoss = losses.length ? Math.min.apply(null, losses.map(function(f){return num(f.closedPnl)})) : 0;
    var ordered = closed.slice().sort(function(a,b){ return num(a.time)-num(b.time); });
    var maxW=0,maxL=0,cw=0,cl=0,winRuns=[],lossRuns=[],longs=0,longWins=0,shorts=0,shortWins=0;
    ordered.forEach(function(f){
      var pnl=num(f.closedPnl), dir=String(f.dir || '').toUpperCase();
      if (dir.indexOf('LONG')>=0) { longs++; if(pnl>0) longWins++; }
      if (dir.indexOf('SHORT')>=0) { shorts++; if(pnl>0) shortWins++; }
      if (pnl>0) { cw++; maxW=Math.max(maxW,cw); if(cl){lossRuns.push(cl);cl=0;} }
      else { cl++; maxL=Math.max(maxL,cl); if(cw){winRuns.push(cw);cw=0;} }
    });
    if(cw) winRuns.push(cw); if(cl) lossRuns.push(cl);
    return { fills:fills,closed:closed,wins:wins,losses:losses,gp:gp,gl:gl,net:net,avgW:avgW,avgL:avgL,wr:wr,rr:rr,pf:pf,largestProfit:largestProfit,largestLoss:largestLoss,maxW:maxW,maxL:maxL,longs:longs,longWins:longWins,shorts:shorts,shortWins:shortWins,avgRunW:winRuns.length?winRuns.reduce(function(a,b){return a+b},0)/winRuns.length:0,avgRunL:lossRuns.length?lossRuns.reduce(function(a,b){return a+b},0)/lossRuns.length:0 };
  }

  function paintBalance(b) {
    if (!b) return;
    var bal = Math.max(0, num(b.display));
    var balanceSignature = JSON.stringify([
      bal, num(b.execution), num(b.available), num(b.perpsAvailable),
      num(b.margin), num(b.spot)
    ]);
    if (balanceSignature === lastBalanceSignature) { restoreStableView(); return; }
    lastBalanceSignature = balanceSignature;
    setText('capital', '$' + bal.toFixed(2));
    setText('capitalIDR', 'Rp ' + Math.round(bal * IDR).toLocaleString());
    setText('perfCapital', '$' + bal.toFixed(2));
    setText('perfCapitalIDR', 'Rp ' + Math.round(bal * IDR).toLocaleString());
    setText('perfIsolated', '$' + num(b.margin).toFixed(2));
    setText('perfAvailable', '$' + num(b.available).toFixed(2));
    window._userWalletDisplayBalance = bal;
    window._userWalletBalance = num(b.execution);
    window._userWalletAvailable = num(b.perpsAvailable);
    window._userWalletDisplayAvailable = num(b.available);
    window._userWalletMarginUsed = num(b.margin);
    window._userWalletSpotUsdc = num(b.spot);

    var wb = document.getElementById('walletBreakdown');
    if (!wb) {
      var cap = document.getElementById('capital');
      if (cap && cap.parentElement) { wb = document.createElement('div'); wb.id='walletBreakdown'; cap.parentElement.appendChild(wb); }
    }
    if (wb) {
      stableHtml.walletBreakdown = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:2px"><span style="font-size:10px;color:var(--text-muted)">Margin: <span style="color:var(--gold)">$'+num(b.margin).toFixed(2)+'</span></span><span style="font-size:10px;color:var(--text-muted)">Available: <span style="color:var(--green)">$'+num(b.available).toFixed(2)+'</span></span><span style="font-size:10px;color:var(--text-muted)">DEXes: <span style="color:var(--accent)">Main+xyz+km+vntl</span></span><span style="font-size:9px;color:#00e676;font-weight:800">HL DIRECT</span></div>';
      if (wb.innerHTML !== stableHtml.walletBreakdown) wb.innerHTML = stableHtml.walletBreakdown;
    }
  }

  function paintPositions(b) {
    if (!b) return;
    var list = b.positions || [], tbody=document.getElementById('positionsTableBody'), table=document.getElementById('positionsTable'), empty=document.getElementById('emptyPositions');
    window._hlPositionCount = list.length;
    var positionSignature = JSON.stringify(list.map(function(pos) {
      return [pos.coin, pos.szi, pos.entryPx, pos.unrealizedPnl];
    }));
    if (positionSignature === lastPositionSignature) return;
    lastPositionSignature = positionSignature;
    setText('positionCount', list.length + ' open');
    var total=0, live=[];
    if (!list.length) {
      if (tbody) tbody.innerHTML='';
      if (table) table.style.display='none';
      if (empty) { empty.style.display=''; empty.innerHTML='<div class="icon">📊</div><div class="text">Belum ada posisi real di Hyperliquid</div><div class="sub">Wallet tersinkron langsung · 0 posisi terbuka</div>'; }
      setText('totalFloatingPnl','+$0.0000','var(--text-muted)');
      window._hlPosLive=[];
      return;
    }
    if (empty) empty.style.display='none'; if (table) table.style.display='';
    var html='';
    list.forEach(function(pos){
      var coin=String(pos.coin||'').split(':').pop(), szi=num(pos.szi), entry=num(pos.entryPx), upnl=num(pos.unrealizedPnl), side=szi>=0?'LONG':'SHORT', size=Math.abs(szi), current=(szi!==0&&entry>0)?entry+(upnl/szi):entry;
      total+=upnl;
      live.push({displayCoin:coin,szi:szi,entry:entry,current:current,upnl:upnl,symbolKey:coin+'/USD'});
      html += '<tr><td style="color:var(--accent);font-size:10px">HL DIRECT</td><td style="font-weight:700">'+esc(coin)+'/USD</td><td style="color:'+(side==='LONG'?'var(--green)':'var(--red)')+';font-weight:800">'+side+'</td><td>'+size+'</td><td>'+entry.toFixed(entry>=1000?2:5)+'</td><td style="color:var(--text-muted)">—</td><td style="color:var(--text-muted)">—</td><td>'+current.toFixed(current>=1000?2:5)+'</td><td style="color:'+(upnl>=0?'var(--green)':'var(--red)')+';font-weight:800">'+(upnl>=0?'+':'')+'$'+upnl.toFixed(4)+'</td><td style="color:var(--text-muted)">live</td><td><span style="color:var(--green);font-size:9px">● HL</span></td></tr>';
    });
    if (tbody) tbody.innerHTML=html;
    setText('totalFloatingPnl',(total>=0?'+$':'-$')+Math.abs(total).toFixed(4),total>=0?'var(--green)':'var(--red)');
    window._hlPosLive=live;
  }

  function drawEquity(p) {
    var canvas=document.getElementById('equityChart'); if(!canvas||!p||!p.avh||p.avh.length<2) return;
    var pts=p.avh.map(function(r){return num(r&&r[1],NaN)}).filter(Number.isFinite); while(pts.length>2&&pts[0]<=0.01)pts.shift(); if(pts.length<2)return;
    var ctx=canvas.getContext('2d'), W=canvas.width, H=canvas.height; if(!W||!H){W=canvas.width=1100;H=canvas.height=260;}
    var min=Math.min.apply(null,pts),max=Math.max.apply(null,pts),range=max-min||1,pad={l:58,r:18,t:14,b:24};
    function x(i){return pad.l+i/(pts.length-1)*(W-pad.l-pad.r)} function y(v){return H-pad.b-(v-min)/range*(H-pad.t-pad.b)}
    ctx.clearRect(0,0,W,H);ctx.strokeStyle='rgba(255,255,255,.07)';ctx.fillStyle='rgba(255,255,255,.45)';ctx.font='10px monospace';ctx.textAlign='right';
    for(var i=0;i<=4;i++){var yy=pad.t+i*(H-pad.t-pad.b)/4,val=max-i/4*range;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(W-pad.r,yy);ctx.stroke();ctx.fillText('$'+val.toFixed(2),pad.l-5,yy+3)}
    var up=p.netPnl==null?pts[pts.length-1]>=pts[0]:p.netPnl>=0;ctx.strokeStyle=up?'#00e676':'#ff5252';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x(0),y(pts[0]));for(var j=1;j<pts.length;j++)ctx.lineTo(x(j),y(pts[j]));ctx.stroke();canvas.style.visibility='visible';
  }

  function paintMonthly(closed) {
    var el=document.getElementById('monthlyGrid'); if(!el)return;
    var m={}; (closed||[]).forEach(function(f){var d=new Date(num(f.time));if(!Number.isFinite(d.getTime()))return;var k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');m[k]=(m[k]||0)+num(f.closedPnl)});
    var keys=Object.keys(m).sort().reverse(); if(!keys.length){el.innerHTML='<div style="color:var(--text-muted);font-size:11px;padding:8px">Belum ada realized trade pada fills yang dikembalikan Hyperliquid.</div>';return;}
    var h='<table style="width:100%;font-size:11px;font-family:JetBrains Mono,monospace;border-collapse:collapse"><tr><th style="text-align:left;padding:6px">Bulan</th><th style="text-align:right;padding:6px">Realized P&L</th></tr>';
    keys.forEach(function(k){var v=m[k];h+='<tr style="border-top:1px solid rgba(255,255,255,.05)"><td style="padding:6px">'+k+'</td><td style="padding:6px;text-align:right;color:'+(v>=0?'var(--green)':'var(--red)')+'">'+(v>=0?'+$':'-$')+Math.abs(v).toFixed(4)+'</td></tr>'});el.innerHTML=h+'</table>';
  }

  function paintHistory(fills, p, b) {
    installHistoryTypeFilter();
    var s=fillStats(fills), totalBal=b?num(b.display):0;
    var portfolioNet=p&&p.netPnl!=null?p.netPnl:s.net;
    var basis=totalBal-portfolioNet; if(!(basis>0))basis=totalBal||10;
    var growth=basis>0?portfolioNet/basis*100:0;
    setText('historyCount',s.closed.length+' closed · '+fills.length+' fills · HL DIRECT','var(--green)');
    setText('trades',s.closed.length+' trades (HL)');
    setText('winRate',s.wr.toFixed(1)+'%',s.wr>=50?'var(--green)':'var(--gold)');
    setText('statNetPnl',(portfolioNet>=0?'+$':'-$')+Math.abs(portfolioNet).toFixed(4),portfolioNet>=0?'var(--green)':'var(--red)');
    setText('statGrowth',(growth>=0?'+':'')+growth.toFixed(2)+'%',growth>=0?'var(--green)':'var(--red)');
    setText('statMaxDD',(p?p.maxDDpct:0).toFixed(2)+'%','var(--red)');
    setText('statTotalTrades',String(s.closed.length));
    setText('dGrossProfit','$'+s.gp.toFixed(4),'var(--green)'); setText('dGrossLoss','-$'+s.gl.toFixed(4),'var(--red)');
    setText('dAvgProfit','$'+s.avgW.toFixed(4)); setText('dAvgLoss','$'+s.avgL.toFixed(4)); setText('dPayoff','$'+(s.closed.length?portfolioNet/s.closed.length:0).toFixed(4)); setText('dInitDeposit','$'+basis.toFixed(2));
    setText('dPF',s.pf===Infinity?'∞':s.pf.toFixed(2)); setText('dWinRate',s.wr.toFixed(2)+'% ('+s.wins.length+')','var(--green)'); setText('dLossRate',(100-s.wr).toFixed(2)+'% ('+s.losses.length+')','var(--red)'); setText('dRR',s.rr>0?s.rr.toFixed(2):'-');
    setText('dRecovery',p&&p.maxDDval>0?(portfolioNet/p.maxDDval).toFixed(2):'-'); setText('dMaxProfit','$'+Math.max(0,s.largestProfit).toFixed(4));
    setText('dMaxDDVal','$'+(p?p.maxDDval:0).toFixed(4),'var(--red)'); setText('dAbsDD','$'+(p?p.maxDDval:0).toFixed(2)); setText('dLargestProfit','$'+s.largestProfit.toFixed(4),'var(--green)'); setText('dLargestLoss','-$'+Math.abs(s.largestLoss).toFixed(4),'var(--red)'); setText('dMaxLoss','$'+(p?p.maxDDval:Math.abs(s.largestLoss)).toFixed(4));
    setText('dConsecLoss',String(s.maxL),'var(--gold)'); setText('dLongsWon',s.longWins+'/'+s.longs+' ('+(s.longs?Math.round(s.longWins/s.longs*100):0)+'%)'); setText('dShortsWon',s.shortWins+'/'+s.shorts+' ('+(s.shorts?Math.round(s.shortWins/s.shorts*100):0)+'%)'); setText('dConsecWins',String(s.maxW),'var(--gold)'); setText('dAvgConsecW',s.avgRunW.toFixed(1)); setText('dAvgConsecL',s.avgRunL.toFixed(1)); setText('dTotalTrades2',String(s.closed.length),'var(--gold)');

    var historySignature = JSON.stringify([
      fills.length,
      fills.length ? [fills[0].time, fills[0].tid || fills[0].oid, fills[0].closedPnl] : null,
      fills.length ? [fills[fills.length-1].time, fills[fills.length-1].tid || fills[fills.length-1].oid, fills[fills.length-1].closedPnl] : null,
      p && p.netPnl, p && p.maxDDpct
    ]);
    if (historySignature === lastHistorySignature) return;
    lastHistorySignature = historySignature;
    var tbody=document.getElementById('historyTableBody'), table=document.getElementById('historyTable'), empty=document.getElementById('emptyHistory'), info=document.getElementById('tradeLogInfo'), more=document.getElementById('loadMoreDealsWrap');
    var sorted=fills.slice().sort(function(a,b){return num(b.time)-num(a.time)}); window._pagesHlFills=sorted; window._pagesHlShown=0;
    if (!sorted.length) { if(tbody)tbody.innerHTML=''; if(table)table.style.display='none'; if(empty){empty.style.display='';empty.innerHTML='<div class="icon">📋</div><div class="text">Hyperliquid mengembalikan 0 fills untuk wallet ini</div><div class="sub">Wallet: '+esc(cache.wallet.slice(0,8))+'…'+esc(cache.wallet.slice(-6))+' · sumber HL DIRECT</div>';} if(info)info.textContent='Hyperliquid fills · 0 fills · HL DIRECT'; if(more)more.style.display='none'; return; }
    if(table)table.style.display=''; if(empty)empty.style.display='none'; if(tbody)tbody.innerHTML='';
    function append(n) {
      if(!tbody)return; var start=window._pagesHlShown||0,end=Math.min(start+n,sorted.length),html='';
      for(var i=start;i<end;i++){
        var f=sorted[i], tm=new Date(num(f.time)), pnl=num(f.closedPnl), close=Math.abs(pnl)>1e-12, side=String(f.dir||f.side||'FILL'), coin=String(f.coin||'').split(':').pop(), px=num(f.px), sz=num(f.sz), deal=String(f.tid||f.oid||i+1);
        html+='<tr><td style="color:var(--text-muted);font-size:10px">'+(Number.isFinite(tm.getTime())?tm.toLocaleString():'-')+'</td><td title="'+esc(deal)+'">'+esc(deal.slice(0,12))+'</td><td style="font-weight:700">'+esc(coin)+'</td><td style="color:'+(String(side).toUpperCase().indexOf('SHORT')>=0||String(side).toUpperCase().indexOf('SELL')>=0?'var(--red)':'var(--green)')+';font-weight:700">'+esc(side)+'</td><td>'+(close?'CLOSE':'FILL')+'</td><td>'+sz+'</td><td>'+px.toFixed(px>=1000?2:px>=1?5:7)+'</td><td style="color:'+(pnl>0?'var(--green)':pnl<0?'var(--red)':'var(--text-muted)')+';font-weight:700">'+(close?(pnl>=0?'+$':'-$')+Math.abs(pnl).toFixed(4):'—')+'</td><td style="color:var(--text-muted)">HL</td></tr>';
      }
      tbody.insertAdjacentHTML('beforeend',html); window._pagesHlShown=end;
      if(info)info.textContent='Hyperliquid fills · '+end+'/'+sorted.length+' fills · HL DIRECT';
      if(more){more.style.display=end<sorted.length?'':'none';var btn=document.getElementById('loadMoreDealsBtn');if(btn)btn.textContent='📋 Load More +'+Math.min(100,sorted.length-end)+' Fills ('+(sorted.length-end)+' remaining)';}
    }
    window._loadMoreDeals=function(){append(100)}; append(100); paintMonthly(s.closed); if(p)drawEquity(p);
  }

  function paintStatusError(msg) {
    var count=document.getElementById('historyCount'); if(count){count.textContent='HL DIRECT ERROR · '+msg;count.style.color='var(--red)';}
  }

  function paintCached() {
    setAllPairMode();
    if (cache.balance) { paintBalance(cache.balance); paintPositions(cache.balance); }
    if (cache.fills) paintHistory(cache.fills, cache.portfolio, cache.balance);
    else if (cache.lastError) paintStatusError(cache.lastError);
  }

  async function syncDirect() {
    if (syncBusy) return;
    var wallet=activeWallet(); if(!wallet)return;
    syncBusy=true; cache.wallet=wallet; window._userWallet=wallet;
    try {
      var reqs=[
        postInfo({type:'clearinghouseState',user:wallet}),
        postInfo({type:'clearinghouseState',user:wallet,dex:'xyz'}),
        postInfo({type:'clearinghouseState',user:wallet,dex:'km'}),
        postInfo({type:'clearinghouseState',user:wallet,dex:'vntl'}),
        postInfo({type:'spotClearinghouseState',user:wallet}),
        postInfo({type:'userFills',user:wallet}),
        postInfo({type:'portfolio',user:wallet})
      ];
      var res=await Promise.allSettled(reqs);
      var states=[]; for(var i=0;i<4;i++) if(res[i].status==='fulfilled')states.push(res[i].value);
      var spot=res[4].status==='fulfilled'?res[4].value:null;
      var fills=res[5].status==='fulfilled'&&Array.isArray(res[5].value)?res[5].value:null;
      var pf=res[6].status==='fulfilled'?portfolioStats(res[6].value):null;
      if(states.length||spot) cache.balance=parseBalance(states,spot);
      if(fills) cache.fills=fills;
      if(pf) cache.portfolio=pf;
      var errs=res.filter(function(x){return x.status==='rejected'}).map(function(x){return x.reason&&x.reason.message?x.reason.message:String(x.reason)});
      cache.lastError=errs.length?errs.join(' | '):''; cache.syncedAt=Date.now();
      paintCached();
      if (fills) console.info('[Pages HL DIRECT]',wallet,'balance=',cache.balance&&cache.balance.display,'fills=',fills.length,'closed=',fillStats(fills).closed.length);
    } catch(e) { cache.lastError=e&&e.message?e.message:String(e); paintCached(); }
    finally { syncBusy=false; }
  }

  function start() {
    setAllPairMode();
    installHistoryTypeFilter();
    installStableViewGuard();
    syncDirect();
    setTimeout(syncDirect,1200); setTimeout(syncDirect,3500);
    setInterval(syncDirect,10000);
    // Never repaint the same snapshot on a timer. Rebuilding DOM every second
    // made static labels and wallet cards appear to pulse. A fresh exchange
    // snapshot already paints every 10 seconds, with two short startup retries.
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
