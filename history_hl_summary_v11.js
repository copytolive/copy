(function(){
'use strict';
var HL='https://api.hyperliquid.xyz/info', TICK=1200, BALANCE_POLL=12000, TOL=0.02;
function n(v,d){var x=Number(v);return Number.isFinite(x)?x:(d==null?0:d);}
function validWallet(v){return /^0x[a-fA-F0-9]{40}$/.test(String(v||'').trim());}
function lower(v){return validWallet(v)?String(v).trim().toLowerCase():'';}
function coin(v){v=String(v||'').toUpperCase().trim();if(v.indexOf(':')>=0)v=v.split(':').pop();return v.replace('/USDC','').replace('/USDT','').replace('/USD','').replace('-USD','')||'-';}
function side(x){var s=String(x&&(x.side||x.type||x.direction)||'').toUpperCase();return s.indexOf('SELL')>=0||s.indexOf('SHORT')>=0?'SELL':'BUY';}
function tm(v){if(typeof v==='number'&&Number.isFinite(v))return v;var x=Date.parse(v||'');return Number.isFinite(x)?x:0;}
function fmtMoney(v){v=n(v,0);return (v>=0?'+$':'-$')+Math.abs(v).toFixed(4);}
function fmtBalance(v){return '$'+Math.max(0,n(v,0)).toFixed(2);}
function fillKey(x){return [x&&x._hlAccount||'',coin(x&&x.symbol),x&&x.trade_id||'',x&&x.timestamp||'',n(x&&x.price),n(x&&x.volume)].join('|');}
function dirEntry(x){var d=String(x&&(x._hlDir||x.direction)||'').toUpperCase();if(d.indexOf('LONG')>=0)return'LONG';if(d.indexOf('SHORT')>=0)return'SHORT';return side(x)==='SELL'?'SHORT':'LONG';}
function dirClose(x){var d=String(x&&(x._hlDir||x.direction)||'').toUpperCase();if(d.indexOf('CLOSE LONG')>=0||d.indexOf('LONG')>=0)return'LONG';if(d.indexOf('CLOSE SHORT')>=0||d.indexOf('SHORT')>=0)return'SHORT';return side(x)==='SELL'?'LONG':'SHORT';}
function entryPnlMap(fills){
  var ordered=(fills||[]).slice().sort(function(a,b){return tm(a&&a.timestamp)-tm(b&&b.timestamp);}),buckets={},map={};
  function bucket(x,d){var k=[x&&x._hlAccount||'',coin(x&&x.symbol),d].join('|');return buckets[k]||(buckets[k]=[]);}
  ordered.forEach(function(x){
    if(!x)return;var q=Math.abs(n(x.volume!=null?x.volume:x.lot,0));if(!(q>0))return;
    if(x.is_entry){var d=dirEntry(x),lot={key:fillKey(x),remaining:q,realized:0,matched:false,dir:d,entry:n(x.price!=null?x.price:x.entry_price,0),symbol:coin(x.symbol),account:x._hlAccount||''};bucket(x,d).push(lot);map[lot.key]=lot;return;}
    if(x.pnl==null)return;var b=bucket(x,dirClose(x)),left=q,matched=[];
    for(var i=0;i<b.length&&left>1e-12;i++){if(!(b[i].remaining>1e-12))continue;var use=Math.min(b[i].remaining,left);matched.push([b[i],use]);left-=use;}
    var mq=matched.reduce(function(s,m){return s+m[1];},0);if(!(mq>0))return;
    matched.forEach(function(m){m[0].realized+=n(x.pnl)*(m[1]/mq);m[0].remaining=Math.max(0,m[0].remaining-m[1]);m[0].matched=true;});
  });
  return map;
}
function livePosMap(){var m={};(Array.isArray(window._hlPosLive)?window._hlPosLive:[]).forEach(function(p){var k=coin(p&&(p.displayCoin||p.coin||p.symbolKey));if(k!=='-')m[k]=p;});return m;}
function directPnl(x,map,pos){var lot=map[fillKey(x)];if(!lot)return null;var value=lot.realized,label=lot.matched?'REAL':'',p=pos[lot.symbol];if(lot.remaining>1e-12&&p&&n(p.current,0)>0&&lot.entry>0){var q=Math.min(lot.remaining,Math.abs(n(p.szi,0))||lot.remaining),mark=n(p.current),u=(lot.dir==='LONG'?(mark-lot.entry):(lot.entry-mark))*q;value+=u;label='LIVE';}if(!label)return null;return{value:value,label:label};}
function pendingPnl(o,fills,pos){var px=n(o&&(o.trigger_price||o.price||o.limit_price),0),q=Math.abs(n(o&&(o.volume||o.lot),0));if(!(px>0&&q>0))return null;var sym=coin(o.symbol),p=pos[sym],ep=p&&n(p.entry,0)>0?n(p.entry):0,dir=p?(n(p.szi,0)>=0?'LONG':'SHORT'):'';if(!ep){var best=null;(fills||[]).forEach(function(f){if(!f||!f.is_entry||coin(f.symbol)!==sym)return;if(o._hlAccount&&f._hlAccount!==o._hlAccount)return;if(!best||tm(f.timestamp)>tm(best.timestamp))best=f;});if(best){ep=n(best.price,0);dir=dirEntry(best);}}if(!(ep>0&&dir))return null;return{value:(dir==='LONG'?(px-ep):(ep-px))*q,label:'EST'};}
function ensureBar(){
  var filters=document.getElementById('historyTypeFilters');if(!filters)return null;
  var bar=document.getElementById('ctlHistoryPnlSummaryV11');
  if(!bar){bar=document.createElement('div');bar.id='ctlHistoryPnlSummaryV11';bar.style.cssText='display:none;align-items:center;gap:14px;flex-wrap:wrap;margin:0 0 10px 0;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:rgba(5,14,26,.78);font-family:JetBrains Mono,monospace;font-size:11px;line-height:1.35;';filters.parentNode.insertBefore(bar,filters);}
  return bar;
}
function span(label,value,color,title){return '<span'+(title?' title="'+String(title).replace(/"/g,'&quot;')+'"':'')+'><span style="color:var(--text-muted);font-weight:700">'+label+'</span> <b style="color:'+color+'">'+value+'</b></span>';}
function paintTotals(){
  var st=window.__CTL_HISTORY_STABLE__,bar=ensureBar();if(!st||st.version<10||!bar)return false;
  var mode=st.mode||window._historyTypeFilter||'all',fills=Array.isArray(st.fills)?st.fills:[],pos=livePosMap();
  if(mode!=='pending'&&mode!=='direct'){bar.style.display='none';return true;}
  var html='',total=0,count=0;
  if(mode==='direct'){
    var map=entryPnlMap(fills),real=0,live=0,unmatched=0;
    fills.filter(function(x){return x&&x.is_entry;}).forEach(function(x){var r=directPnl(x,map,pos);if(!r){unmatched++;return;}total+=r.value;count++;if(r.label==='LIVE')live++;else real++;});
    html+=span('TOTAL PNL · LANGSUNG ENTRY',fmtMoney(total),total>1e-12?'var(--green)':(total<-1e-12?'var(--red)':'var(--text-secondary)'),'Jumlah REAL/LIVE PnL seluruh entry yang dapat dipasangkan secara aman.');
    html+=span('TERHITUNG',String(count),'var(--accent)');
    html+=span('REAL',String(real),'var(--green)');
    html+=span('LIVE',String(live),'var(--gold)');
    if(unmatched)html+=span('BELUM TERPASANG',String(unmatched),'var(--text-muted)');
  } else {
    var pending=Array.isArray(st.pending)?st.pending:[],tp=0,sl=0,other=0,tpN=0,slN=0,otherN=0;
    pending.forEach(function(o){var r=pendingPnl(o,fills,pos);if(!r)return;var k=String(o._pendingKind||'').toUpperCase();total+=r.value;count++;if(k==='TP'){tp+=r.value;tpN++;}else if(k==='SL'){sl+=r.value;slN++;}else{other+=r.value;otherN++;}});
    html+=span('TOTAL PNL · PENDING (EST)',fmtMoney(total),total>1e-12?'var(--green)':(total<-1e-12?'var(--red)':'var(--text-secondary)'),'Estimasi penjumlahan semua target pending. TP dan SL dapat bersifat mutually-exclusive; lihat split TP/SL.');
    html+=span('TP',fmtMoney(tp)+' · '+tpN,'var(--green)');
    html+=span('SL',fmtMoney(sl)+' · '+slN,'var(--red)');
    if(otherN)html+=span('OTHER',fmtMoney(other)+' · '+otherN,'var(--gold)');
  }
  var bp=window.__CTL_HL_BALANCE_PARITY_V11__;
  if(bp&&bp.last&&bp.last.direct!=null){var ok=Math.abs(bp.last.delta)<=TOL,color=ok?'var(--green)':'var(--red)';html+=span('HL BALANCE CHECK',ok?'✓ SAME':'⚠ Δ '+(bp.last.delta>=0?'+':'')+bp.last.delta.toFixed(2),color,(bp.last.account||'')+' · Direct HL '+fmtBalance(bp.last.direct)+' vs dashboard '+fmtBalance(bp.last.dashboard));html+=span('HL',fmtBalance(bp.last.direct),'var(--accent)');html+=span('DASHBOARD',fmtBalance(bp.last.dashboard),ok?'var(--green)':'var(--red)');}
  bar.innerHTML=html;bar.style.display='flex';return true;
}
async function post(body,ms){var c=new AbortController(),to=setTimeout(function(){c.abort();},ms||8000);try{var r=await fetch(HL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:c.signal});if(!r.ok)throw new Error('HL '+r.status);var d=await r.json();if(d&&d.error)throw new Error(String(d.error));return d;}finally{clearTimeout(to);}}
var dexCache={at:0,list:['']};
async function dexes(){if(Date.now()-dexCache.at<300000)return dexCache.list;var list=[''];try{var d=await post({type:'perpDexs'},8000);if(Array.isArray(d))d.forEach(function(x){var nm=typeof x==='string'?x:(x&&typeof x.name==='string'?x.name:(Array.isArray(x)?x[0]:''));nm=String(nm||'').trim();if(nm&&list.indexOf(nm)<0)list.push(nm);});}catch(e){}dexCache={at:Date.now(),list:list.slice(0,16)};return dexCache.list;}
function seedAccount(){var st=window.__CTL_HISTORY_STABLE__,c=[];[window._hlAccountWallet,window._userWallet,window._pagesHlActiveWallet,window._hlActiveWallet,window._hlSelectedWallet].forEach(function(x){x=lower(x);if(x&&c.indexOf(x)<0)c.push(x);});if(st&&Array.isArray(st.accounts))st.accounts.forEach(function(x){x=lower(x);if(x&&c.indexOf(x)<0)c.push(x);});return c[0]||'';}
async function canonicalAccount(a){if(!a)return'';try{var r=await post({type:'userRole',user:a},6500),role=String(r&&r.role||'').toLowerCase();if(role==='agent'&&validWallet(r&&r.data&&r.data.user))return lower(r.data.user);}catch(e){}return a;}
async function directBalance(account){
  var dx=await dexes(),totalAcct=0,totalMargin=0,totalWithdraw=0,ok=0;
  var rs=await Promise.allSettled(dx.map(function(d){var b={type:'clearinghouseState',user:account};if(d)b.dex=d;return post(b,8500);}));
  rs.forEach(function(r){if(r.status!=='fulfilled'||!r.value)return;ok++;var ms=r.value.marginSummary||{};totalAcct+=n(ms.accountValue,0);totalMargin+=n(ms.totalMarginUsed,0);totalWithdraw+=n(r.value.withdrawable,0);});
  var usdc=0,hold=0;try{var sp=await post({type:'spotClearinghouseState',user:account},8500),bals=sp&&sp.balances||[];for(var i=0;i<bals.length;i++){if(String(bals[i].coin||'').toUpperCase()==='USDC'){usdc=n(bals[i].total,0);hold=n(bals[i].hold,0);break;}}}catch(e){}
  if(!ok&&!(usdc>0))throw new Error('No direct balance state');
  var spotAvailable=Math.max(0,usdc-hold),display=usdc>0?usdc:(Math.max(0,totalAcct)+spotAvailable),perps=totalAcct,available=totalWithdraw>0?totalWithdraw:Math.max(0,totalAcct-totalMargin);
  return{display:display,perps:perps,spotUsdc:usdc,available:available};
}
function correctDashboard(v){if(!(v>0))return;var cur=n(window._userWalletDisplayBalance,0);if(Math.abs(cur-v)<=TOL)return;window._userWalletDisplayBalance=v;window._lastGoodWalletBalance=window._lastGoodWalletBalance||{};window._lastGoodWalletBalance.displayBalance=v;['capital','perfCapital'].forEach(function(id){var e=document.getElementById(id);if(e)e.textContent='$'+v.toFixed(2);});['capitalIDR','perfCapitalIDR'].forEach(function(id){var e=document.getElementById(id);if(e)e.textContent='Rp '+Math.round(v*17100).toLocaleString();});}
async function checkBalance(){var state=window.__CTL_HL_BALANCE_PARITY_V11__;if(!state||state.checking)return;var seed=seedAccount();if(!seed)return;state.checking=true;try{var acct=await canonicalAccount(seed),r=await directBalance(acct),dashboard=n(window._userWalletDisplayBalance,0);if(!(dashboard>0)){var e=document.getElementById('capital');if(e)dashboard=n(String(e.textContent||'').replace(/[^0-9.\-]/g,''),0);}var delta=dashboard-r.display;state.last={at:Date.now(),account:acct,direct:r.display,dashboard:dashboard,delta:delta,perps:r.perps,spotUsdc:r.spotUsdc,available:r.available};if(r.display>0&&Math.abs(delta)>TOL){correctDashboard(r.display);state.last.dashboard=r.display;state.last.delta=0;state.last.corrected=true;}paintTotals();}catch(e){state.lastError=String(e&&e.message||e);}finally{state.checking=false;}}
function install(){
  var old=window.__CTL_HL_SUMMARY_V11__;if(old&&old.timer)try{clearInterval(old.timer);}catch(e){}if(old&&old.balanceTimer)try{clearInterval(old.balanceTimer);}catch(e){}
  var bp=window.__CTL_HL_BALANCE_PARITY_V11__||{ready:true,checking:false,last:null,lastError:''};window.__CTL_HL_BALANCE_PARITY_V11__=bp;
  var state={ready:true,version:11,timer:setInterval(paintTotals,TICK),balanceTimer:setInterval(checkBalance,BALANCE_POLL),paint:paintTotals,checkBalance:checkBalance};window.__CTL_HL_SUMMARY_V11__=state;
  paintTotals();checkBalance();return true;
}
window.__ctlInstallHlSummaryV11=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0);},{once:true});else setTimeout(install,0);
})();
